import mqtt from "npm:mqtt";
import { parse } from "jsr:@std/yaml";
import Logger from "https://deno.land/x/logger/logger.ts";
import {
  HueAPIPayload,
  HueResources,
  HueResourceType,
  Settings,
} from "./types.ts";
import { MQTTPayload } from "./types.ts";

const logger = new Logger();
const settings = parse(
  await Deno.readTextFile(Deno.args[0] || "./config/config.yml"),
) as Settings;
const client = mqtt.connect(settings.mqtt.host, settings.mqtt.options);

const cache = new Map();

const hue = <T>(
  method: string,
  endpoint: string,
  payload: Record<string, unknown> | null = null,
): Promise<{ data: T }> => {
  const url = `https://${settings.hue.host}/clip/v2/${endpoint}`;
  const config = {
    method,
    headers: {
      "Content-Type": "application/json",
      "hue-application-key": settings.hue.key,
    },
  } as RequestInit;

  if (payload) {
    config.body = JSON.stringify(payload);
  }

  logger.info(`[Hue] ${method} ${url}`);

  if (method === "GET" && cache.has(url)) {
    const cached = cache.get(url);

    // 5 minutes
    if (Date.now() - cached.timestamp < 300000) {
      logger.info(`[Cache] Hit for ${url}`);
      return cached.data;
    }
  }

  return fetch(url, config).then((res) => {
    const data = res.json();

    if (method === "GET") {
      cache.set(url, { data, timestamp: Date.now() });
      logger.info(`[Cache] Miss for ${url}`);
    }

    return data;
  });
};

const slugify = (name: string) => {
  return name
    .trim()
    .replaceAll(" ", "_")
    .replaceAll("-", "_")
    .toLowerCase();
};

const mqtt_payload_to_hueapi = (message: BufferSource) => {
  const body: HueAPIPayload = {};
  let payload: MQTTPayload = {};

  const decoder = new TextDecoder();

  try {
    payload = JSON.parse(decoder.decode(message));
  } catch (e) {
    logger.error(e);
    return payload;
  }

  if (payload.state && ["ON", "OFF"].includes(payload.state)) {
    body.on = { on: payload.state === "ON" };
  }

  if (payload.brightness) {
    body.dimming = {
      brightness: payload.brightness * 100 / 254,
    };
  }

  if (payload.color) {
    if ("x" in payload.color && "y" in payload.color) {
      body.color = {
        xy: {
          x: payload.color.x,
          y: payload.color.y,
        },
      };
    }
  }

  if (payload.color_temp) {
    body.color_temperature = {
      mirek: payload.color_temp,
    };
  }
  return body;
};

client.on("connect", () => {
  logger.info("[Init] Connected to MQTT broker");

  client.subscribe("hue/+/+");

  client.on("message", async (topic, message) => {
    logger.info(`[MQTT] Received message on topic ${topic}`);

    const [_, resourceType, pattern] = topic.split("/");

    switch (resourceType as HueResourceType) {
      case "light": {
        const resources = await hue<HueResources>("GET", "resource/light");
        const match = resources.data.find((r) =>
          slugify(r.metadata.name) === pattern
        );
        if (!match) {
          logger.error(`[Hue] Light ${pattern} not found`);
          return;
        }

        await hue(
          "PUT",
          `resource/light/${match.id}`,
          mqtt_payload_to_hueapi(message),
        );
        logger.info(`[Hue] Light ${pattern} updated`);
        return;
      }
      case "zone":
      case "room": {
        const type = resourceType === "zone" ? "zone" : "room";

        const resources = await hue<HueResources>("GET", `resource/${type}`);
        const match = resources.data.find((r) =>
          slugify(r.metadata.name) === pattern
        );

        if (!match) {
          logger.error(`[Hue] ${type} ${pattern} not found`);
          return;
        }

        const grouped_light = match.services.find((s) =>
          s.rtype === "grouped_light"
        );

        if (!grouped_light) {
          logger.error(`[Hue] ${type} ${pattern} has no grouped_light service`);
          return;
        }

        await hue(
          "PUT",
          `resource/grouped_light/${grouped_light.rid}`,
          mqtt_payload_to_hueapi(message),
        );
        return;
      }
      default:
        break;
    }
  });
});

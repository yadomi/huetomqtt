import MQTT from "mqtt";
import Axios from "axios";
import https from "https";
import wayfarer from "wayfarer";
import log from "loglevel";
import { resolve } from "path";
import { Config, HueHTTPDeviceResponse, HueHTTPLocationResponse, Location, Payload, State } from "./types";

const args = process.argv.slice(2);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function getConfig(): Config {
  const userconfig = require(resolve(args[0]));
  userconfig.huetomqtt = Object.assign(
    {
      prefix: "hue",
      loglevel: log.levels.INFO,
    },
    userconfig.huetomqtt
  );

  return userconfig;
}

const config = getConfig();
log.setLevel(config.huetomqtt.loglevel);

const mqtt = MQTT.connect(config.mqtt);
const hue = Axios.create({
  baseURL: `https://${config.hue.bridge}/clip/v2`,
  timeout: 1000,
  headers: {
    "hue-application-key": config.hue.token,
  },
  httpsAgent: new https.Agent({
    rejectUnauthorized: false,
  }),
});

function HTTPEndpoint(...parts: string[]) {
  const endpoint = ["resource", ...parts].join("/");
  log.debug("[HTTP]", { endpoint });
  return endpoint;
}

function getResources(pattern: string, locations: Location[] | null[]) {
  const children = locations
    .filter(Boolean)
    .map((location) => location.children)
    .flat();

  if (pattern === "*") {
    return children;
  } else {
    return children.filter((device) => new RegExp(pattern).test(device.name));
  }
}

const state: State = {
  room: [],
  zone: [],
};

async function init() {
  const { data: lights } = await hue.get<HueHTTPDeviceResponse>(HTTPEndpoint("light"));
  const { data: rooms } = await hue.get<HueHTTPLocationResponse>(HTTPEndpoint("room"));
  const { data: zones } = await hue.get<HueHTTPLocationResponse>(HTTPEndpoint("zone"));

  state["room"] = rooms.data.map((room) => ({
    name: room.metadata.name,
    id: room.id,
    children: room.children.reduce((acc, child) => {
      const light = lights.data.find((value) => value.owner.rid == child.rid);
      acc.push({ name: light.metadata.name, id: light.id, resourceType: "light" });
      return acc;
    }, []),
  }));

  state["zone"] = zones.data.map((zone) => ({
    name: zone.metadata.name,
    id: zone.id,
    children: zone.children.reduce((acc, child) => {
      const light = lights.data.find((value) => value.id == child.rid);
      acc.push({ name: light.metadata.name, id: light.id, resourceType: "light" });
      return acc;
    }, []),
  }));
}

mqtt.on("close", (...args) => log.debug("close", ...args));
mqtt.on("disconnect", (...args) => log.info("[MQTT] Disconnected", ...args));
mqtt.on("error", (...args) => log.error("error", ...args));

mqtt.on("connect", async function () {
  log.info("[MQTT]", "Connected to broker");

  await init();

  mqtt.subscribe([config.huetomqtt.prefix, "set"].join("/"));
  mqtt.subscribe([config.huetomqtt.prefix, "state/refresh"].join("/"));

  const router = wayfarer();

  router.on("/hue/state/refresh", async () => {
    await init();
    log.info(JSON.stringify(state, null, 4));
    mqtt.publish([config.huetomqtt.prefix, "state"].join("/"), JSON.stringify(state, null, 2), { retain: true });
  });

  router.on("/hue/set", async (params, topic, payload) => {
    const data = JSON.parse(payload.toString()) as Payload;
    if (!data.match) return;

    if (!("device" in data.match)) return;

    const resources = getResources(data.match.device, [
      ...(data.match.room ? state.room.filter((room) => new RegExp(data.match.room).test(room.name)) : []),
      ...(data.match.zone ? state.zone.filter((zone) => new RegExp(data.match.zone).test(zone.name)) : []),
    ]);

    if (resources.length === 0) return;
    console.log({ resources });

    log.info(`Found ${resources.length} resource(s) that match device pattern "${data.match.device}"`);
    if (log.getLevel() === log.levels.DEBUG) {
      log.debug("Matched: ");
      for (const resource of resources) {
        log.debug(`- ${resource.name} - (${resource.id})`);
      }
    }

    for (const resource of resources) {
      await hue
        .put(HTTPEndpoint(resource.resourceType, resource.id), data.state)
        .then((res) => log.info("[HTTP] response", res.data))
        .catch((err) => log.error(err.response.data.errors));

      await wait(250); // Avoid bottleneck on the hub
    }
  });

  mqtt.on("message", async (topic, payload) => {
    log.info("[MQTT]", "Received message with topic: ", topic);
    router(topic, topic, payload);
  });
});

process.on("uncaughtException", function (error: Error) {
  log.error("[ERROR]", error.message);
  log.debug(error);
});

process.on("unhandledRejection", function (error: Error) {
  log.error("[ERROR]", error.message);
  log.debug(error);
});

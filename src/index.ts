import MQTT, { IClientOptions } from "mqtt";
import Axios from "axios";
import https from "https";
import wayfarer from "wayfarer";
import log from "loglevel";
import { resolve } from "path";

type Config = {
  mqtt: IClientOptions;
  hue: {
    bridge: string;
    token: string;
  };
  huetomqtt: {
    prefix: string;
    autoPublishOnConnect: boolean;
    loglevel: log.LogLevelDesc;
  };
};

const args = process.argv.slice(2);

function getConfig(): Config {
  const userconfig = require(resolve(args[0]));
  userconfig.huetomqtt = Object.assign(
    {
      prefix: "hue",
      autoPublishOnConnect: true,
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

const RESOURCES = [
  "light",
  "scene",
  "room",
  "zone",
  "bridge_home",
  "grouped_light",
  "device",
  "bridge",
  "device_power",
  "zigbee_connectivity",
  "zgp_connectivity",
  "motion",
  "temperature",
  "light_level",
  "button",
  "behavior_script",
  "behavior_instance",
  "geofence_client",
  "geolocation",
  "entertainment_configuration",
  "entertainment",
  "homekit",
];

function format(response) {
  return JSON.stringify(response.data, null, 2);
}

function MQTTEndpoint(...parts: string[]) {
  return [config.huetomqtt.prefix, "resource", ...parts].join("/");
}

function HTTPEndpoint(...parts: string[]) {
  return ["resource", ...parts].join("/");
}

async function init (mqtt: MQTT.MqttClient) {
  for (const resource of RESOURCES) {
    const response = await hue.get(HTTPEndpoint(resource));
    mqtt.publish(MQTTEndpoint(resource), format(response.data), { retain: true })
  }
}

mqtt.on("connect", async function () {
  log.info("[MQTT]", "Connected to broker");

  if (config.huetomqtt.autoPublishOnConnect) {
    await init(mqtt);
  }

  mqtt.subscribe([config.huetomqtt.prefix, "resource", "+", "get"].join("/"));
  mqtt.subscribe([config.huetomqtt.prefix, "resource", "+", "+", "get"].join("/"));
  mqtt.subscribe([config.huetomqtt.prefix, "resource", "+", "set"].join("/"));
  mqtt.subscribe([config.huetomqtt.prefix, "resource", "+", "+", "set"].join("/"));

  const router = wayfarer();

  router.on("/hue/resource/:resource/get", async ({ resource }) => {
    const response = await hue.get(HTTPEndpoint(resource));
    mqtt.publish(MQTTEndpoint(resource), format(response), { retain: true });
  });

  router.on("/hue/resource/:resource/:id/get", async ({ resource, id }) => {
    const response = await hue.get(HTTPEndpoint(resource, id));
    mqtt.publish(MQTTEndpoint(resource, id), format(response));
  });

  router.on("/hue/resource/:resource/:id/set", async ({ resource, id }, topic, payload) => {
    const data = JSON.parse(payload.toString());
    let response = await hue.put(HTTPEndpoint(resource, id), data);
    mqtt.publish(MQTTEndpoint(resource, id), format(response));

    response = await hue.get(HTTPEndpoint(resource));
    mqtt.publish(MQTTEndpoint(resource), format(response), { retain: true });
  });

  mqtt.on("message", async (topic, payload) => {
    log.info("[MQTT]", "Received message with topic: ", topic);
    if (!RESOURCES.some((value) => topic.includes(value))) {
      throw new Error(`Invalid resource name in: ${topic}`);
    }

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

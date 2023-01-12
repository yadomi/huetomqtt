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
    loglevel: log.LogLevelDesc;
  };
};

const args = process.argv.slice(2);

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
  return ["resource", ...parts].join("/");
}

function getResources(pattern: string, resources: any) {
  if (pattern === "*") {
    return resources.children;
  } else {
    return [resources.children.find((device) => device.name === pattern)];
  }
}

const state = {
  room: [],
  zone: [],
};

async function init() {
  const { data: rooms } = await hue.get(HTTPEndpoint("room"));
  const { data: lights } = await hue.get(HTTPEndpoint("light"));
  const { data: zones } = await hue.get(HTTPEndpoint("zone"));

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
    console.log(state, [config.huetomqtt.prefix, "state"].join("/"));
    mqtt.publish([config.huetomqtt.prefix, "state"].join("/"), JSON.stringify(state, null, 2), { retain: true });
  });

  router.on("/hue/set", async (params, topic, payload) => {
    const data = JSON.parse(payload.toString());
    if (!data.match) return;

    let resources = [];
    if (("room" in data.match || "zone" in data.match) && "device" in data.match) {
      const room = state.room.find((room) => room.name === data.match.room);
      const zone = state.zone.find((zone) => zone.name === data.match.zone);
      if (!room && !zone) return;

      resources = getResources(data.match.device, room || zone);
    }

    console.log({ resources });
    if (resources.length === 0) return;

    for (const resource of resources) {
      try {
        const response = await hue.put(HTTPEndpoint(resource.resourceType, resource.id), data.state);
        console.log(response.data.errors);
      } catch (error) {
        log.error(error.response.data.errors);
      }
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

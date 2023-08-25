import log from "loglevel";
import { IClientOptions } from "mqtt";

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

type Resource = {
  name: string;
  id: string;
  resourceType: "light";
};

type Location = {
  name: string;
  id: string;
  children: Resource[];
};

type State = {
  room: Location[];
  zone: Location[];
};

interface MatchRoom {
  room: string;
  zone?: never;
}

interface MatchZone {
  room?: never;
  zone: string;
}

type Match = MatchRoom | MatchZone;

type Payload = {
  match: Match & { device: string };
  state: unknown;
};

type HueHTTPLocationResponse = { data: { metadata: { name: string }; id: string; children: { rid: string }[] }[] };
type HueHTTPDeviceResponse = { data: { metadata: { name: string }; id: string; owner: { rid: string } }[] };

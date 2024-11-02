import mqtt from "npm:mqtt";

export type HueResourceType = "light" | "zone" | "room";
export type HueResource = {
    id: string;
    metadata: {
        name: string;
    };
    services: {
        rtype: string;
        rid: string;
    }[];
    };

export type HueResources = HueResource[];
export type HueAPIPayload = {
    on?: {
        on: boolean;
    },
    dimming?: {
        brightness: number; // 0-100
    },
    color?: {
        xy: {
            x: number; // 0-1
            y: number; // 0-1
        },
    },
    color_temperature?: {
        mirek: number; // 153-500
    },
}

export type MQTTPayload = {
    state?: "ON" | "OFF";
    brightness?: number; // 0-254
    color?: {
        x: number; // 0-1
        y: number; // 0-1
    },
    color_temp?: number; // 153-500
}

export type Settings = {
    mqtt: {
        host: string;
        options?: mqtt.IClientOptions
    },
    hue: {
        host: string;
        key: string;
    },
}

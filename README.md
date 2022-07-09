huetomqtt
=========

huetomqtt is an MQTT bridge for Philips Hue. It use the Hue V2 API and is almost a 1 to 1 translation between the HTTP API and MQTT.

## Usage

### With Docker:

With plain docker: 

```
docker run yadomi/huetomqtt -v $PWD/config.json:/etc/config.json
```

Or with a docker-compose.yml (`docker-compose up`):


```
version: "3.0"

services:
  mqttbroker:
    image: eclipse-mosquitto:2.0.11
  mqtthue:
    image: yadomi/huetomqtt:latest
    volumes:
      - ./config.json:/etc/config.json
```

## Configuration file

The configuration file is a JSON file to specify which Hue hub to use and MQTT Broker.

Example:

```
{
  "hue": {
    "bridge": "192.168.1.80",
    "token": "..."
  },
  "mqtt": {
    "host": "192.168.1.100",
    "clientId": "huetomqtt",
    "username": "brucewayne",
    "password": "batmobile" 
  },
  "huetomqtt": {
    "prefix": "hue",
  }
}
```

### `Config.hue`:

|property       |description|required|default|
|-|-|-|-|
| `bridge`  | IP address or domain to the Hue Bridge | `true` | |
| `token`   | A Hue bridge application key. See official [docs](https://developers.meethue.com/develop/get-started-2/#findme1) | `true` | |

### `Config.mqtt`:

The `mqtt` key accept an object that accept any options from [MQTT.js](https://github.com/mqttjs/MQTT.js). See the typescript definition for more details: 

https://github.com/mqttjs/MQTT.js/blob/8b0fa591fbe6575ff855ede104f4d35472546167/types/lib/client-options.d.ts#L10

### `Config.huetomqtt`:

|property        |description|required|default|
|-|-|-|-|
| `loglevel`      | The level of log, accept any value of [`LogLevel`](https://github.com/pimterry/loglevel/blob/f5a642299bf77a81118d68766a168c9568ecd21b/index.d.ts#L32-L37) | `false` | `info` |
| `prefix`        | The MQTT prefix used when publishing/subscribing a message | `false` | `hue` |
| `autoPublishOnConnect`| Auto publish all resources on connect in a retained message | `false` | `true` |

## MQTT topic

If `autoPublishOnConnect` is set `true`, huetomqtt will get all the resources information on connect and publish that info in a corresponding retained message.

### API 

The bridge will respond to the following topics: 

|topic|description|
|-|-|
|`/<prefix>/resource/<resource>/<resourceId>/get`| Get state of a specific resource by it's `resourceId` |
|`/<prefix>/resource/<resource>/<resourceId>/set`| Set state of a specific resource by it's `resourceId`. Payload must be any valid payload for the specified resources, see the [Official Hue API V2 Reference](https://developers.meethue.com/develop/hue-api-v2/api-reference/) for more info. |
|`/<prefix>/resource/<resource>/get`| Return the state of multiple resources |


huetomqtt
=========

huetomqtt is an MQTT bridge for Philips Hue. It use the Hue V2 API and is almost a 1 to 1 translation between the HTTP API and MQTT.

## Usage

### With Docker:

With plain docker:

```
docker run yadomi/huetomqtt:unstable -v $PWD/config.json:/app/config/config.json
```


## Configuration file

The configuration file is YML file to specify the Hue hub and MQTT Broker to use.

Example:

```yml
mqtt:
  host: mqtt://192.168.10.50
  options:
    username: mqttusername
    password: thisissecure

hue:
  host: 192.168.10.120
  key: a_hue_token_but_hue_call_it_username_it_is_very_weird

```

You can get a bridge token with cURL :

```sh
curl 'http://<your_bridge_aip>/api' -X POST --data-raw '{"devicetype":"huetomqtt"}'
```

More info at: https://developers.meethue.com/develop/get-started-2/

### `Config.hue`:

|property       |description|required|default|
|-|-|-|-|
| `host`  | IP address or domain to the Hue Bridge | `true` | |
| `key`   | A Hue bridge application key | `true` | |

### `Config.mqtt`:

The `mqtt` key accept an object that accept any options from [MQTT.js](https://github.com/mqttjs/MQTT.js). See the typescript definition for more details:

https://github.com/mqttjs/MQTT.js/blob/8b0fa591fbe6575ff855ede104f4d35472546167/types/lib/client-options.d.ts#L10


### API


This app subcribe to `<prefix>/+/+` and will act as follow based on how lights are configured in the Hue app:

The topic act as follow: `<prefix>/<resourceType>/<resourceName>`

supported `resourceType`:
https://github.com/yadomi/huetomqtt/blob/79b4a535514c8ea7be2c6391fc2c670b190098b8/types.ts#L3


Example, to turn on the light named "Ruban TV", you can publish:

- topic: `<prefix>/light/ruban_tv`
- payload: `{ state: "ON" }`

You can also control a whole room:

- topic: `<prefix>/room/cuisine`
- payload: `{ state: "ON" }`

Each resources (rooms, lights, zone ect...) are slugified and will match the closest match.
Example, if in the app you have a room called "Salle de jeux", you'll have to use "salle_de_jeux" in the topic.

To control the brightness or color temperature:

- topic: `<prefix>/zone/cuisine`
- payload: `{ brightness: 128, color_temp: 400 }`

For a descriptive list of what can be sent in the payload, take a look at the type definition:

https://github.com/yadomi/huetomqtt/blob/79b4a535514c8ea7be2c6391fc2c670b190098b8/types.ts#L34-L42

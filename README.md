# homebridge-lutron-shades
Lutron shades plugin for homebridge: https://github.com/nfarina/homebridge

This plugin controls Lutron shade groups, nothing more right now, feel free to contribute :)

## configuration parameters

parameter    | type     | required    | default          | description
------------ | -------- | ----------- | ---------------- | --------------
id           | int      | yes         |                  | Lutron IntegrationID for the shade group you want to control.
type         | string   | no          | venetian blind   | **available values:** <br>`venetian blind` <br>`roller shade`  
host         | string   | no          | 192.168.1.192    | ip address of your Lutron processor
username     | string   | no          | lutron           | username for your Lutron processor
password     | string   | no          | lutron           | password for your Lutron processor


## example configuration
```
{
    "bridge": {
        "name": "Lutron shades",
        "username": "00:00:00:00:00:00",
        "port": 51826,
        "pin": "031-45-153"
    },
    
    "description": "Control Lutron shades!",
    
    "accessories": [
        {
            "accessory": "LutronShades",
            "name": "Venetian blinds",
            "type": "venetian blinds",
            "id": 1,
            "host": "192.168.1.100",
            "username": "lutron",
            "password": "lutron"
        }
    ],
    
    "platforms": []
}
```

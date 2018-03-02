'use strict';

const EventEmitter = require('events').EventEmitter;
const net = require('net');

let Characteristic, Service;
let LutronConnectionInstances = {};

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory('homebridge-lutron', 'LutronAccessory', LutronAccessory, true);
};

class LutronConnection extends EventEmitter {
    constructor(host, username, password) {
        super();

        this.host = host;
        this.username = username;
        this.password = password;
        this.socket;
        this.connectionBusy = false;
        this.commandQueue = [];

        this.connect();
    }

    /**
     * @param {string} host
     * @param {string} username
     * @param {string} password
     * @returns {LutronConnection}
     */
    static getInstance(host, username, password) {
        let instanceKey = host + '-' + username + '-' + new Buffer(password).toString('base64');

        if (!LutronConnectionInstances[instanceKey]) {
            let instance = new LutronConnection(host, username, password);
            LutronConnectionInstances[instanceKey] = instance;
        }

        return LutronConnectionInstances[instanceKey];
    }

    connect() {
        this.socket = net.connect(23, this.host);
        this.socket.on('data', (data) => {
            console.log('RECEIVED>>', data, '<<');

            if (data === 'login: ') this.send(this.username);
            else if (data === 'password: ') this.send(this.password);
            else this.incomingData(data);
        }).on('connect', () => {

        }).on('end', () => {
            this.connect();
        });
    }

    incomingData(data) {
        var str = String(data);

        if (/GNET>\s/.test(str)) {
            this.connectionBusy = false;

            if (this.commandQueue.length) {
                this.send(this.commandQueue.shift());
            }

            return;
        }

        if (0 === str.indexOf('~OUTPUT')) {
            var params = str.replace('~OUTPUT,', '');

            this.outputReceived.apply(this, params.map(Number));
        }
    }

    statusRecieved(integrationId, parameters) {
        this.emit('output', integrationId, parameters);
    }

    sendCommand(command) {
        if (this.connectionBusy) {
            this.commandQueue.push(command);
        } else {
            this.connectionBusy = true;
            this.send(command);
        }
    }

    send(command) {
        if (!/\r\n$/.test(command)) {
            command += "\r\n";
        }

        this.socket.write(command);
    }
}

class LutronAccessory {

    constructor(log, config) {
        this.log = log;

        this.name = config['name'];
        this.id = config['id'];
        this.lutronConnection = LutronConnection.getInstance(
            config['host'],
            config['username'],
            config['password']
        );

        this.lastPosition = 0; // last known position of the blinds, down by default
        this.currentTiltAngle = 0; // current tilt angle of the blinds, flat by default
        this.currentPositionState = 2; // stopped by default
        this.currentTargetPosition = 0; // down by default
        this.currentTargetTiltAngle = 0;

        // register the service and provide the functions
        this.service = new Service.WindowCovering(this.name);
        this.registerLutronHandlers();
        this.registerServices();
    }

    registerLutronHandlers() {
        this.lutronConnection.on('output', (integrationId, parameters) => {
            if (integrationId === this.id) {
                // Do things.
            }
        });
    }

    registerServices() {
        // the current position (0-100%)
        // https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js#L493
        this.service
            .getCharacteristic(Characteristic.CurrentPosition)
            .on('get', this.getCurrentPosition.bind(this));

        // the position state
        // 0 = DECREASING; 1 = INCREASING; 2 = STOPPED;
        // https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js#L1138
        this.service
            .getCharacteristic(Characteristic.PositionState)
            .on('get', this.getPositionState.bind(this));

        // the target position (0-100%)
        // https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js#L1564
        this.service
            .getCharacteristic(Characteristic.TargetPosition)
            .on('get', this.getTargetPosition.bind(this))
            .on('set', this.setTargetPosition.bind(this));

        // the current tilt state (-90deg-90deg)
        // https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js#L560
        this.service
            .getCharacteristic(Characteristic.CurrentHorizontalTiltAngle)
            .on('get', this.getCurrentTiltAngle.bind(this));

        // the target tilt state (-90deg-90deg)
        // https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js#L560
        this.service
            .getCharacteristic(Characteristic.TargetHorizontalTiltAngle)
            .on('get', this.getTargetTiltAngle.bind(this))
            .on('set', this.setTargetTiltAngle.bind(this));
    }

    getCurrentPosition(callback) {
        this.log('Requested CurrentPosition: %s', this.lastPosition);
        callback(null, this.lastPosition);
    }

    getPositionState(callback) {
        this.log('Requested PositionState: %s', this.currentPositionState);
        callback(null, this.currentPositionState);
    }

    getTargetPosition(callback) {
        this.log('Requested TargetPosition: %s', this.currentTargetPosition);
        callback(null, this.currentTargetPosition);
    }

    setTargetPosition(pos, callback) {
        this.log('Set TargetPosition: %s', pos);
        callback(null);
    }

    getCurrentTiltAngle() {
        // TODO IMPLEMENT METHOD
        callback(null, this.currentTiltAngle);
    }

    getTargetTiltAngle() {
        // TODO IMPLEMENT METHOD
        callback(null, this.currentTargetTiltAngle);
    }

    setTargetTiltAngle(angle, callback) {
        // TODO IMPLEMENT METHOD
        this.log('Set TargetTiltAngle: %s', angle);
        callback(null);
    }

    getServices() {
        return [this.service];
    }
}

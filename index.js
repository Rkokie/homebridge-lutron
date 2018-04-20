'use strict';

const EventEmitter = require('events').EventEmitter;
const net = require('net');
//const LutronConnection = require('../node-lutron-connection').LutronConnection;

let Characteristic, Service;

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory('homebridge-lutron-shades', 'LutronShades', LutronShades, true);
};


let LutronConnectionInstances = {};

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
            let message = data.toString();
            //console.log('RECEIVED>>', message, '<<');

            if (message === 'login: ') this.send(this.username);
            else if (message === 'password: ') this.send(this.password);
            else this.incomingData(message);
        }).on('connect', () => {

        }).on('end', () => {
            this.connect();
            console.log('LUTRON CONNECTION BROKE D:');
        });
    }

    incomingData(data) {
        let str = String(data);

        if (/GNET>\s/.test(str)) {
            this.connectionBusy = false;

            if (this.commandQueue.length) {
                this.send(this.commandQueue.shift());
            }

            return;
        }

        if (0 === str.indexOf('~OUTPUT')) {
            let params = str.replace('~OUTPUT,', '').split(',');

            this.statusReceived('output', ...params.map(Number));
        }

        if (0 === str.indexOf('~SHADEGRP')) {
            let params = str.replace('~SHADEGRP,', '').split(',');

            this.statusReceived('shadeGroup', ...params.map(Number));
        }
    }

    statusReceived(type, integrationId, actionId, ...parameters) {
        // type, integrationId, action, params
        this.emit(type, integrationId, actionId, parameters);
    }

    sendCommand(command) {
        //if (this.connectionBusy) {
        //    this.commandQueue.push(command);
        //} else {
        //    this.connectionBusy = true;
        this.send(command);
        //}
    }

    send(command) {
        if (!/\r\n$/.test(command)) {
            command += "\r\n";
        }

        this.socket.write(command);
    }
}

const SHADE_TYPE = {
    VENETIAN_BLIND: 'venetian blinds',
    ROLLER_SHADE: 'roller shade'
};

class LutronShade {
    get canTilt() {
        return false;
    }

    static createFromType(type) {
        switch (type) {
            case SHADE_TYPE.VENETIAN_BLIND:
                return new LutronVenetianBlind();
            case SHADE_TYPE.ROLLER_SHADE:
                return new LutronRollerShade();
            default:
                return new LutronShade();
        }
    }
}

class LutronVenetianBlind implements LutronShade {
    get canTilt() {
        return true;
    }
}

class LutronRollerShade implements LutronShade {
    get canTilt() {
        return false;
    }
}

class LutronShades {

    constructor(log, config) {
        this.log = log;

        this.name = config['name'];
        this.integrationId = config['id'];
        this.shade = LutronShade.createFromType(config['shadeType'] || SHADE_TYPE.VENETIAN_BLIND);
        this.lutronConnection = LutronConnection.getInstance(
            config['host'] || '192.168.1.192',
            config['username'] || 'lutron',
            config['password'] || 'lutron'
        );

        this._lastPosition = 0; // last known position of the blinds, down by default
        this._currentTiltAngle = 0; // current tilt angle of the blinds, flat by default
        this._currentPositionState = 2; // stopped by default
        this._currentTargetPosition = 0; // down by default
        this._currentTargetTiltAngle = 0;

        // register the service and provide the functions
        this.service = new Service.WindowCovering(this.name);
        this.registerLutronHandlers();
        this.registerServices();
        this.fetchCurrentValues();
    }

    get lastPosition() { return this._lastPosition; }
    get currentTiltAngle() { return this._currentTiltAngle; }
    get currentPositionState() { return this._currentPositionState; }
    get currentTargetPosition() { return this._currentTargetPosition; }
    get currentTargetTiltAngle() { return this._currentTargetTiltAngle; }

    set lastPosition(value) {
        this._lastPosition = value;
        this.service.getCharacteristic(Characteristic.CurrentPosition).setValue(this._lastPosition);
    }

    set currentTiltAngle(value) {
        this._currentTiltAngle = value;
        this.service.getCharacteristic(Characteristic.CurrentHorizontalTiltAngle).setValue(this._currentTiltAngle);
    }

    set currentPositionState(value) {
        this._currentPositionState = value;
        this.service.getCharacteristic(Characteristic.PositionState).setValue(this._currentPositionState);
    }

    set currentTargetPosition(value) {
        this._currentTargetPosition = value;
        this.service.getCharacteristic(Characteristic.TargetPosition).setValue(this._currentTargetPosition);
    }

    set currentTargetTiltAngle(value) {
        this._currentTargetTiltAngle = value;
        this.service.getCharacteristic(Characteristic.TargetHorizontalTiltAngle).setValue(this._currentTargetTiltAngle);
    }

    fetchCurrentValues() {
        this.lutronConnection.sendCommand('?SHADEGRP,' + this.integrationId + ',1');

        if (this.shade.canTilt) {
            this.lutronConnection.sendCommand('?SHADEGRP,' + this.integrationId + ',14');
        }
    }

    registerLutronHandlers() {
        this.lutronConnection.on('shadeGroup', (integrationId, actionId, parameters) => {
            if (integrationId !== this.integrationId) {
                // this event is not ment for this integration.
                return;
            }

            //console.log('SHADEGRP,' + integrationId + ',' + actionId + ',' + parameters.join(','));

            switch (+actionId) {
                case 1: // level
                    if (this.currentPositionState === 2) {
                        this.currentTargetPosition = Math.round(+parameters[0]);
                    } else {
                        this.lastPosition = Math.round(+parameters[0]);
                    }
                    break;
                case 2: // raising
                    this.currentPositionState = 1;
                    break;
                case 3: // lowering
                    this.currentPositionState = 0;
                    break;
                case 4: // stop raising/lowering
                    this.currentPositionState = 2;
                    break;
                case 14: // Tilt level
                    this.currentTiltAngle = this.lutronAngleToHomekitAngle(+parameters[0]);
                    break;
                case 32: // raising/lowering/stopped
                    this.currentPositionState = +parameters[0];

                    if (this.currentPositionState === 2) {
                        this.lastPosition = Math.round(+parameters[1]);
                    }
                    break;
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

        if (this.shade.canTilt) {
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

    getCurrentTiltAngle(callback) {
        callback(null, this.currentTiltAngle);
    }

    getTargetTiltAngle(callback) {
        callback(null, this.currentTargetTiltAngle);
    }

    setTargetPosition(pos, callback) {
        let command = '#SHADEGRP,' + this.integrationId + ',1,' + pos;
        this.log('Set TargetPosition: %s [Lutron command: %s]', pos, command);
        this._currentTargetPosition = pos;
        this.lutronConnection.sendCommand(command);
        callback(null);
    }

    setTargetTiltAngle(angle, callback) {
        let lutronAngle = this.homekitAngleToLutronAngle(angle);
        let command = '#SHADEGRP,' + this.integrationId + ',14,' + Math.round(lutronAngle);
        this.log('Set TargetTiltAngle: %s [Lutron command: %s]', angle, command);
        this._currentTargetTiltAngle = angle;
        this.lutronConnection.sendCommand(command);
        callback(null);
    }

    /**
     * 0-100 to -90-90
     */
    lutronAngleToHomekitAngle(percentage) {
        let conversionValue = 90 / 50;
        return Math.round((percentage - 50) * conversionValue);
    }

    /**
     * -90-90 to 0-100
     */
    homekitAngleToLutronAngle(angle) {
        let conversionValue = 50 / 90;

        if (+angle >= 0) {
            return (angle * conversionValue) + 50;
        } else {
            return (90 - Math.abs(angle)) * conversionValue;
        }
    }

    getServices() {
        return [this.service];
    }
}

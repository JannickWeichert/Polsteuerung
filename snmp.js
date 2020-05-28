var config = require('./config');
var aufZweiStellenRunden = require('./utils').aufZweiStellenRunden;
var debug = require('./utils').debug;

var snmp = require("net-snmp");

var session = new snmp.createSession(config.SNMP_IP, config.SNMP_COMMUNITY);

var handleSnmpDataReceived = (error, varbinds, onSuccess) => {
	if (!error && varbinds && varbinds[0] && varbinds[0].value) {
		var reading = aufZweiStellenRunden(varbinds[0].value);
		reading && onSuccess(reading);
	}
};

var readSnmp = (address, onSuccess) => {
	session.get([address], (error, result) => handleSnmpDataReceived(error, result, onSuccess));
};

module.exports = {readSnmp};

var SNMP_COMMUNITY = require('./poolscript').SNMP_COMMUNITY;
var SNMP_IP = require('./poolscript').SNMP_IP;
var aufZweiStellenRunden = require('./utils').aufZweiStellenRunden;
var debug = require('./utils').debug;

var snmp = require("net-snmp");

var session = new snmp.createSession(SNMP_IP, SNMP_COMMUNITY);

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

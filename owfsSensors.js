var aufZweiStellenRunden = require('./utils').aufZweiStellenRunden;
var debug = require('./utils').debug;
var config = require('./config');

var Client = require("owfs").Client;
var con = new Client(config.OWFS_IP, config.OWFS_PORT);

var handleOwfsDataReceived = (error, result, onSuccess) => {
	if (!error && result && typeof onSuccess === "function") {
		var reading = aufZweiStellenRunden(result);
		reading && onSuccess(reading);
	}
};

var readOwfs = (address, onSuccess) => {
	try {
	con.read(address, (error, result) => handleOwfsDataReceived(error, result, onSuccess));
	} catch (e) {
		debug('OWFS Lesefehler: address' + address + ', Fehler: '  + e);
	}
};

var writeOwfs = (address, value, cb) => {
	if (!cb) {
		cb = () => { };
	}
	try {
		con.write(address, value, cb);
	} catch (e) {
		debug('OWFS Schreibfehler: address' + address + ', value: ' + value + ', Fehler: '  + e);

	}
};
module.exports = {readOwfs, writeOwfs};

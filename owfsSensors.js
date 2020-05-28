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

var readOwfs = (adress, onSuccess) => {
	con.read(adress, (error, result) => handleOwfsDataReceived(error, result, onSuccess));
};

var writeOwfs = (address, value, cb) => {
	if (!cb) {
		cb = () => {
		};
	}
	con.write(address, value, cb);
};
module.exports = {readOwfs, writeOwfs};

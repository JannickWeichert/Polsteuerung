var fs = require('fs');
var debug = require('./utils').debug;
var aufZweiStellenRunden = require('./utils').aufZweiStellenRunden;
var config = require('./config');

var leseLaufzeit = (onSuccess) => {
	try {
		fs.readFile(config.laufzeitFilename, (err, data) => {
			data && onSuccess(aufZweiStellenRunden(data.toString()));
		});
	} catch (e) {
		debug("Loading Laufzeit failed " + e);
	}
};

var setzeLaufzeit = (laufzeit) => {
	try {
		fs.writeFile(config.laufzeitFilename, laufzeit.toString(), (err) => {
			if (err) {
				throw err;
			}
		});
	} catch (e) {
		debug("Writing Laufzeit failed " + e);
	}
};

module.exports = {leseLaufzeit, setzeLaufzeit};

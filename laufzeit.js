var fs = require('fs');
var debug = require('./utils').debug;
var aufZweiStellenRunden = require('./utils').aufZweiStellenRunden;
const laufzeitFilename = require('./poolscript').laufzeitFilename;


var leseLaufzeit = (path, onSuccess) => {
	try {
		fs.readFile(path, (err, data) => {
			data && onSuccess(aufZweiStellenRunden(data.toString()));
		});
	} catch (e) {
		debug("Loading Laufzeit failed " + e);
	}
};

var setzeLaufzeit = (path, Laufzeit) => {
	try {
		fs.writeFile(path, Laufzeit.toString(), (err) => {
			if (err) {
				throw err;
			}
		});
	} catch (e) {
		debug("Writing Laufzeit failed " + e);
	}
};

module.exports = {leseLaufzeit, setzeLaufzeit};

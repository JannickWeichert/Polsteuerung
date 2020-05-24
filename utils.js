var aufZweiStellenRunden = (reading) => {
	if (reading && typeof reading !== "number") {
		try {
			reading = parseFloat(reading);
		} catch (e) {
			return;
		}
	}
	if (typeof reading === "number") {
		return Math.round(100 * reading) / 100;
	}
};

var debug = (message) => {
	var datum = new Date();
	datum = datum.toISOString().replace(/T/, ' ').replace(/\..+/, '');
	console.log(datum, " - ", message);
};

module.exports = {aufZweiStellenRunden, debug};

"use strict";

module.exports.notify = (...args) => {
	if (args[0] instanceof Error) {
		console.error("[imap-core]", args[0]);
	}
	return false;
};

module.exports.notifyConnection = (connection, err) => {
	if (err instanceof Error) {
		console.error("[imap-core]", err);
	}
	return false;
};

module.exports.intercept = () => false;
module.exports.gelf = {};

module.exports.applyErrorLogMeta = (logEntry, err) => {
	if (err instanceof Error) {
		return Object.assign({}, logEntry, {
			_error: err.message,
			_stack: err.stack,
		});
	}
	return logEntry;
};

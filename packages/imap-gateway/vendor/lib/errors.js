"use strict";

module.exports.notify = (...args) => {
	if (args[0] instanceof Error) {
		console.error("[imap-core]", args[0]);
	}
	return false;
};

// Connection errors are client-driven and already logged as one line by the
// connection logger; printing stacks here only floods the journal.
module.exports.notifyConnection = () => false;

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

'use strict';

const DEFAULT_QUOTES = ['LOGOUT completed'];

module.exports = {
    handler(command) {
        this.session.selected = this.selected = false;
        this.state = 'Logout';

        this.clearNotificationListener();
        this.send('* BYE Logout requested');

        let logoutMessages = [].concat(this._server.options.logoutMessages || []).filter(msg => typeof msg === 'string');
        if (!logoutMessages || !logoutMessages.length) {
            logoutMessages = DEFAULT_QUOTES;
        }

        this.send(command.tag + ' OK ' + logoutMessages[Math.floor(Math.random() * logoutMessages.length)]);
        setImmediate(() => this.close());
    }
};

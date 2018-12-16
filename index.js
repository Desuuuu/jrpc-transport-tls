'use strict';

/**
 * @external EventEmitter
 * @see {@link https://nodejs.org/api/events.html#events_class_eventemitter}
 */

const tls = require('tls');
const check = require('check-types');
const EventEmitter = require('events');

/**
 * Used when calling a method requiring a connection without having one.
 *
 * @class DisconnectedError
 * @extends Error
 * @memberof TLSTransport
 */
class DisconnectedError extends Error {

  /**
   * @memberof TLSTransport
   * @private
   */
  constructor() {
    super(...arguments);

    this.name = 'DisconnectedError';
  }
}

let _data = new WeakMap();

/**
 * Transport class exported by the module.
 *
 * It sends data to a JSON-RPC server over TLS using a {@link https://nodejs.org/api/tls.html#tls_class_tls_tlssocket|`tls.TLSSocket`}.
 *
 * @class TLSTransport
 * @extends EventEmitter
 *
 * @example
 * const TLSTransport = require('@desuuuu/jrpc-transport-tls');
 */
class TLSTransport extends EventEmitter {

  /**
   * Initialize a new transport instance.
   *
   * @param {Object} options - Transport options.
   * @param {String} options.host - Server IP or hostname.
   * @param {Number} options.port - Server port.
   * @param {Object} [options.extra] - Extra options to pass to {@link https://nodejs.org/api/tls.html#tls_tls_connect_options_callback|`tls.connect`}.
   *
   * @throws {TypeError} Invalid parameter.
   *
   * @emits TLSTransport#connected
   * @emits TLSTransport#disconnected
   * @emits TLSTransport#data
   * @emits TLSTransport#error
   *
   * @example
   * let transport = new TLSTransport({
   *   host: 'example.com',
   *   port: 1234
   * });
   */
  constructor({ host, port, extra }) {
    super();

    check.assert.nonEmptyString(host, 'missing/invalid "host" option');
    check.assert.inRange(port, 1, 65535, 'missing/invalid "port" option');
    check.assert.maybe.object(extra, 'invalid "extra" option');

    extra = Object.assign({
      rejectUnauthorized: true
    }, extra, {
      host,
      port,
      path: undefined,
      socket: undefined
    });

    _data.set(this, {
      options: extra,
      socket: null,
      connected: false,
      error: null
    });
  }

  /**
   * Whether the transport needs to be connected before sending/receiving data.
   *
   * @constant {Boolean}
   * @default true
   */
  get needsConnection() {
    return true;
  }

  /**
   * Whether the transport is currently connected to the server.
   *
   * @type {Boolean}
   * @readonly
   */
  get isConnected() {
    let { connected } = _data.get(this);

    return connected;
  }

  /**
   * Connect to the server.
   *
   * @promise {Promise} Resolves once connected.
   * @reject {Error} Connection error.
   */
  connect() {
    return new Promise((resolve, reject) => {
      let data = _data.get(this);

      if (data.socket) {
        if (data.connected) {
          return resolve();
        }

        return reject(new Error('Connection already in progress'));
      }

      let onConnected;
      let onDisconnected;

      onConnected = () => {
        this.removeListener('disconnected', onDisconnected);

        resolve();
      };

      onDisconnected = (err) => {
        this.removeListener('connected', onConnected);

        reject(err || new Error('Connection failed'));
      };

      this.once('connected', onConnected);
      this.once('disconnected', onDisconnected);

      data.connected = false;

      data.socket = createSocket.call(this, data.options);

      _data.set(this, data);
    });
  }

  /**
   * Disconnect from the server.
   *
   * @promise {Promise} Resolves once disconnected.
   */
  disconnect() {
    return new Promise((resolve) => {
      let { socket } = _data.get(this);

      if (!socket) {
        return resolve();
      }

      let onDisconnected;
      let destroyTimeout;

      onDisconnected = () => {
        clearTimeout(destroyTimeout);

        resolve();
      };

      destroyTimeout = setTimeout(socket.destroy.bind(socket), 5000);

      this.once('disconnected', onDisconnected);

      socket.end();
    });
  }

  /**
   * Send data to the server.
   *
   * @param {String} data - Stringified JSON data to send.
   *
   * @promise {Promise} Resolves after the data has been sent.
   * @reject {DisconnectedError TLSTransport.DisconnectedError} Transport is not connected.
   * @reject {TypeError https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypeError} Invalid parameter.
   *
   * @connection-required
   */
  send(data) {
    return new Promise((resolve, reject) => {
      if (!check.nonEmptyString(data)) {
        return reject(new TypeError('missing/invalid "data" parameter'));
      }

      let { connected, socket } = _data.get(this);

      if (!connected) {
        return reject(new DisconnectedError('Transport not connected'));
      }

      socket.write(`${data}\n`, 'utf8', () => {
        resolve();
      });
    });
  }

}

/**
 * Fired when the transport gets connected to the server.
 *
 * @event TLSTransport#connected
 */

/**
 * Fired when the transport gets disconnected from the server.
 *
 * Can be caused by:
 * <ul>
 *   <li>a call to {@link TLSTransport#disconnect|disconnect}.</li>
 *   <li>a connection timeout.</li>
 * </ul>
 *
 * @event TLSTransport#disconnected
 * @param {Error} error - Encountered error, `null` if none.
 */

/**
 * Fired when data is received from the server.
 *
 * @event TLSTransport#data
 * @param {Object} data - Data received.
 */

/**
 * Fired when an error is encountered by the transport.
 *
 * Can be caused by:
 * <ul>
 *   <li>a {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse|`JSON.parse`} error.</li>
 * </ul>
 *
 * @event TLSTransport#error
 * @param {Error} error - Encountered error.
 */

module.exports = TLSTransport;
module.exports.DisconnectedError = DisconnectedError;

/**
 * Create the socket instance and setup event listeners.
 *
 * @param {Object} options - Options to pass to `tls.connect`.
 * @return Resulting socket instance.
 *
 * @memberof TLSTransport
 * @private
 */
function createSocket(options) {
  let socket = tls.connect(options);

  socket.setEncoding('utf8');
  socket.setKeepAlive(true);
  socket.setNoDelay(true);

  socket.on('secureConnect', onSocketSecureConnect.bind(this));
  socket.on('timeout', onSocketTimeout.bind(this));
  socket.on('error', onSocketError.bind(this));
  socket.on('close', onSocketClose.bind(this));
  socket.on('data', onSocketData.bind(this));

  return socket;
}

/**
 * Handle the socket `secureConnect` event.
 *
 * @memberof TLSTransport
 * @private
 */
function onSocketSecureConnect() {
  let data = _data.get(this);

  data.error = null;
  data.connected = true;

  _data.set(this, data);

  setImmediate(this.emit.bind(this, 'connected'));
}

/**
 * Handle the socket `timeout` event.
 *
 * @memberof TLSTransport
 * @private
 */
function onSocketTimeout() {
  let data = _data.get(this);

  data.error = new Error('Connection timed out');

  _data.set(this, data);

  this.disconnect();
}

/**
 * Handle the socket `error` event.
 *
 * @memberof TLSTransport
 * @private
 */
function onSocketError(err) {
  let data = _data.get(this);

  data.error = err;

  _data.set(this, data);
}

/**
 * Handle the socket `close` event.
 *
 * @memberof TLSTransport
 * @private
 */
function onSocketClose() {
  let data = _data.get(this);
  let error = data.error;

  data.error = null;
  data.socket = null;
  data.connected = false;

  _data.set(this, data);

  setImmediate(this.emit.bind(this, 'disconnected', error));
}

/**
 * Handle the socket `data` event.
 *
 * @memberof TLSTransport
 * @private
 */
function onSocketData(chunk) {
  let data = _data.get(this);

  if (typeof data.buffer !== 'string') {
    data.buffer = '';
  }

  data.buffer += chunk;

  let delimiter = data.buffer.indexOf('\n');

  while (delimiter >= 0) {
    let message;

    try {
      message = JSON.parse(data.buffer.substr(0, delimiter));
    } catch (err) {
      setImmediate(this.emit.bind(this, 'error', err));
    }

    if (message) {
      setImmediate(this.emit.bind(this, 'data', message));
    }

    data.buffer = data.buffer.substr(delimiter + 1);

    delimiter = data.buffer.indexOf('\n');
  }

  _data.set(this, data);
}

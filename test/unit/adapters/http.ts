

describe('supports http with nodejs', function () {
	var axios = require('../../../src').default;
	var http = require('http');
	var https = require('https');
	var net = require('net');
	var url = require('url');
	var zlib = require('zlib');
	var assert = require('assert');
	var fs = require('fs');
	var path = require('path');
	var pkg = require('./../../../package.json');
	let server: any;
	let proxy: any;

	afterEach(function () {
		if (server) {
			server.close();
			server = null;
		}
		if (proxy) {
			proxy.close();
			proxy = null;
		}
		if (process.env.http_proxy) {
			delete process.env.http_proxy;
		}
		if (process.env.no_proxy) {
			delete process.env.no_proxy;
		}
	});

	it('should throw an error if the timeout property is not parsable as a number', async function () {
		server = http.createServer();

		server.on('request', function (req, res) {
			setTimeout(function () {
				res.end();
			}, 1000);
		});

		server.listen(4444);

		var success = false,
			failure = false;
		var error;

		try {
			await axios.get('http://localhost:4444/', {
				timeout: { strangeTimeout: 250 }
			});

			success = true;
		} catch (err) {
			error = err;
			failure = true;
		}

		assert.equal(success, false, 'request should not succeed');
		assert.equal(failure, true, 'request should fail');
		assert.equal(error.code, 'ERR_PARSE_TIMEOUT');
		assert.equal(error.message, 'error trying to parse `config.timeout` to int');
	});

	it('should parse the timeout property', async function () {
		server = http.createServer();

		server.on('request', function (req, res) {
			setTimeout(function () {
				res.end();
			}, 1000);
		});

		server.listen(4444);

		var success = false,
			failure = false;
		var error;

		try {
			await axios.get('http://localhost:4444/', {
				timeout: '250'
			});
			success = true;
		} catch (err) {
			error = err;
			failure = true;
		}

		assert.equal(success, false, 'request should not succeed');
		assert.equal(failure, true, 'request should fail');
		assert.equal(error.message.includes('timeout'), true); //, 'timeout of 250ms exceeded');
		assert.equal(error.code, 'ECONNABORTED');
	});

	it('should respect the timeout property', async function () {
		server = http.createServer();

		server.on('request', function (req, res) {
			setTimeout(function () {
				res.end();
			}, 1000);
		});

		server.listen(4444);
		var success = false,
			failure = false;
		var error;

		try {
			await axios.get('http://localhost:4444/', {
				timeout: 250
			});
			success = true;
		} catch (err) {
			error = err;
			failure = true;
		}

		assert.equal(success, false, 'request should not succeed');
		assert.equal(failure, true, 'request should fail');
		assert.equal(error.code, 'ECONNABORTED');
		assert.equal(error.message.includes('timeout'), true); // , 'timeout of 250ms exceeded');
	});

	it('should allow passing JSON', async function () {
		var data = {
			firstName: 'Fred',
			lastName: 'Flintstone',
			emailAddr: 'fred@example.com'
		};

		server = http.createServer();

		server.on('request', function (req, res) {
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify(data));
		});

		server.listen(4444);

		const res = await axios.get('http://localhost:4444/');

		assert.deepEqual(res.data, data);
	});

	it('should allow passing JSON with BOM', async function () {
		var data = {
			firstName: 'Fred',
			lastName: 'Flintstone',
			emailAddr: 'fred@example.com'
		};

		server = http.createServer();

		server.on('request', function (req, res) {
			res.setHeader('Content-Type', 'application/json');
			var bomBuffer = Buffer.from([0xef, 0xbb, 0xbf]);
			var jsonBuffer = Buffer.from(JSON.stringify(data));
			res.end(Buffer.concat([bomBuffer, jsonBuffer]));
		});

		server.listen(4444);

		const res = await axios.get('http://localhost:4444/');

		assert.deepEqual(res.data, data);
	});

	it('should redirect', async function () {
		var str = 'test response';

		server = http.createServer();

		server.on('request', function (req, res) {
			var parsed = url.parse(req.url);

			if (parsed.pathname === '/one') {
				res.setHeader('Location', '/two');
				res.statusCode = 302;
				res.end();
			} else {
				res.end(str);
			}
		});

		server.listen(4444);

		const res = await axios.get('http://localhost:4444/one');
		assert.equal(res.data, str);
		assert.equal(res.request.path, '/two');
	});

	it('should not redirect', async function () {
		// possible upstream issue, see https://github.com/node-fetch/node-fetch/issues/1335
		server = await http.createServer();

		server.on('request', function (req, res) {
			res.setHeader('Location', '/foo');
			res.statusCode = 302;
			res.end();
		});

		server.listen(4444);

		const res = await axios.get('http://localhost:4444/', {
			maxRedirects: 0,
			validateStatus: function () {
				return true;
			}
		});

		assert.equal(res.status, 302);
		assert.equal(res.headers['location'], '/foo');
	});

	it('should support max redirects', async function () {
		var i = 0;
		server = await http.createServer();

		server.on('request', function (req, res) {
			res.setHeader('Location', '/' + i);
			res.statusCode = 302;
			res.end();
			i++;
		});

		server.listen(4444);

		try {
			await axios.get('http://localhost:4444/', {
				maxRedirects: 3
			});
		} catch (err) {
			// first call + 3 redirects
			assert.equal(i, 4);
		}
	});

	it('should preserve the HTTP verb on redirect', async function () {
		server = await http.createServer();

		server.on('request', function (req, res) {
			if (req.method.toLowerCase() !== 'head') {
				res.statusCode = 400;
				res.end();
				return;
			}

			var parsed = url.parse(req.url);
			if (parsed.pathname === '/one') {
				res.setHeader('Location', '/two');
				res.statusCode = 302;
				res.end();
			} else {
				res.end();
			}
		});

		server.listen(4444);

		const res = await axios.head('http://localhost:4444/one');

		assert.equal(res.status, 200);
	});

	it('should support transparent gunzip', async function () {
		var data = {
			firstName: 'Fred',
			lastName: 'Flintstone',
			emailAddr: 'fred@example.com'
		};

		const zipped = await new Promise((resolve, reject) =>
			zlib.gzip(JSON.stringify(data), (err, result) => {
				if (err) reject(err);
				else resolve(result);
			})
		);

		server = http.createServer();

		server.on('request', function (req, res) {
			res.setHeader('Content-Type', 'application/json');
			res.setHeader('Content-Encoding', 'gzip');
			res.end(zipped);
		});

		server.listen(4444);

		const res = await axios.get('http://localhost:4444/');
		assert.deepEqual(res.data, data);
	});

	it('should support gunzip error handling', async function () {
		server = http.createServer();

		server.on('request', function (req, res) {
			res.setHeader('Content-Type', 'application/json');
			res.setHeader('Content-Encoding', 'gzip');
			res.end('invalid response');
		});

		server.listen(4444);

		let failed = false;
		try {
			await axios.get('http://localhost:4444/');
		} catch (err) {
			failed = true;
		}
		assert.equal(failed, true);
	});

	it('should support disabling automatic decompression of response data', async function () {
		var data = 'Test data';

		const zipped: Buffer = await new Promise((resolve, reject) =>
			zlib.gzip(JSON.stringify(data), (err, result) => {
				if (err) reject(err);
				else resolve(result);
			})
		);

		server = http.createServer();

		server.on('request', function (req, res) {
			res.setHeader('Content-Type', 'text/html;charset=utf-8');
			res.setHeader('Content-Encoding', 'gzip');
			res.end(zipped);
		});

		server.listen(4444);

		const res = await axios.get('http://localhost:4444/', {
			decompress: false,
			responseType: 'arraybuffer'
		});
		assert.equal(Buffer.from(res.data).toString('base64'), zipped.toString('base64'));
	});

	it('should support UTF8', async function () {
		var str = Array(100000).join('ж');

		server = http.createServer();

		server.on('request', function (req, res) {
			res.setHeader('Content-Type', 'text/html; charset=UTF-8');
			res.end(str);
		});

		server.listen(4444);

		const res = await axios.get('http://localhost:4444/');

		assert.equal(res.data, str);
	});

	it('should support basic auth', async function () {
		// parsing from url currently not supported
		server = http.createServer();

		server.on('request', function (req, res) {
			res.end(req.headers.authorization);
		});

		server.listen(4444);
		var user = 'foo';
		var headers = { Authorization: 'Bearer 1234' };
		const res = await axios.get('http://' + user + '@localhost:4444/', { headers: headers });

		var base64 = Buffer.from(user + ':', 'utf8').toString('base64');
		assert.equal(res.data, 'Basic ' + base64);
	});

	it('should support basic auth with a header', async function () {
		server = http.createServer();

		server.on('request', function (req, res) {
			res.end(req.headers.authorization);
		});

		server.listen(4444);

		var auth = { username: 'foo', password: 'bar' };
		var headers = { AuThOrIzAtIoN: 'Bearer 1234' }; // wonky casing to ensure caseless comparison
		const res = await axios.get('http://localhost:4444/', { auth: auth, headers: headers });

		var base64 = Buffer.from('foo:bar', 'utf8').toString('base64');
		assert.equal(res.data, 'Basic ' + base64);
	});

	it('should provides a default User-Agent header', async function () {
		server = http.createServer();

		server.on('request', function (req, res) {
			res.end(req.headers['user-agent']);
		});

		server.listen(4444);

		const res = await axios.get('http://localhost:4444/');

		assert.ok(/^axios\//.test(res.data), `User-Agent header does not match: ${res.data}`);
	});

	it('should allow the User-Agent header to be overridden', async function () {
		server = http.createServer();

		server.on('request', function (req, res) {
			res.end(req.headers['user-agent']);
		});

		server.listen(4444);

		var headers = { 'UsEr-AgEnT': 'foo bar' }; // wonky casing to ensure caseless comparison
		const res = await axios.get('http://localhost:4444/', { headers });
		assert.equal(res.data, 'foo bar');
	});

	it('should allow the Content-Length header to be overridden', async function () {
		server = http.createServer();

		let reqHeaders: any;
		server.on('request', function (req, res) {
			reqHeaders = req.headers;
			res.end();
		});
		server.listen(4444);


		var headers = { 'CoNtEnT-lEnGtH': '42' }; // wonky casing to ensure caseless comparison
		await axios.post('http://localhost:4444/', 'foo', { headers })

		assert.strictEqual(reqHeaders['content-length'], '42');
	});

	it('should support max content length', function (done) {
		var str = Array(100000).join('ж');

		server = http
			.createServer(function (req, res) {
				res.setHeader('Content-Type', 'text/html; charset=UTF-8');
				res.end(str);
			})
			.listen(4444, function () {
				var success = false,
					failure = false,
					error;

				axios
					.get('http://localhost:4444/', {
						maxContentLength: 2000
					})
					.then(function (res) {
						success = true;
					})
					.catch(function (err) {
						error = err;
						failure = true;
					});

				setTimeout(function () {
					assert.equal(success, false, 'request should not succeed');
					assert.equal(failure, true, 'request should fail');
					assert.equal(error.message, 'maxContentLength size of 2000 exceeded');
					done();
				}, 100);
			});
	});

	it('should support max content length for redirected', function (done) {
		var str = Array(100000).join('ж');

		server = http
			.createServer(function (req, res) {
				var parsed = url.parse(req.url);

				if (parsed.pathname === '/two') {
					res.setHeader('Content-Type', 'text/html; charset=UTF-8');
					res.end(str);
				} else {
					res.setHeader('Location', '/two');
					res.statusCode = 302;
					res.end();
				}
			})
			.listen(4444, function () {
				var success = false,
					failure = false,
					error;

				axios
					.get('http://localhost:4444/one', {
						maxContentLength: 2000
					})
					.then(function (res) {
						success = true;
					})
					.catch(function (err) {
						error = err;
						failure = true;
					});

				setTimeout(function () {
					assert.equal(success, false, 'request should not succeed');
					assert.equal(failure, true, 'request should fail');
					assert.equal(error.message, 'maxContentLength size of 2000 exceeded');
					done();
				}, 100);
			});
	});

	it('should support max body length', function (done) {
		var data = Array(100000).join('ж');

		server = http
			.createServer(function (req, res) {
				res.setHeader('Content-Type', 'text/html; charset=UTF-8');
				res.end();
			})
			.listen(4444, function () {
				var success = false,
					failure = false,
					error;

				axios
					.post(
						'http://localhost:4444/',
						{
							data: data
						},
						{
							maxBodyLength: 2000
						}
					)
					.then(function (res) {
						success = true;
					})
					.catch(function (err) {
						error = err;
						failure = true;
					});

				setTimeout(function () {
					assert.equal(success, false, 'request should not succeed');
					assert.equal(failure, true, 'request should fail');
					assert.equal(error.code, 'ERR_FR_MAX_BODY_LENGTH_EXCEEDED');
					assert.equal(error.message, 'Request body larger than maxBodyLength limit');
					done();
				}, 100);
			});
	});

	it('should support sockets', function (done) {
		// Different sockets for win32 vs darwin/linux
		var socketName = './test.sock';

		if (process.platform === 'win32') {
			socketName = '\\\\.\\pipe\\libuv-test';
		}

		server = net
			.createServer(function (socket) {
				socket.on('data', function () {
					socket.end('HTTP/1.1 200 OK\r\n\r\n');
				});
			})
			.listen(socketName, function () {
				axios({
					socketPath: socketName,
					url: '/'
				})
					.then(function (resp) {
						assert.equal(resp.status, 200);
						assert.equal(resp.statusText, 'OK');
						done();
					})
					.catch(function (error) {
						assert.ifError(error);
						done();
					});
			});
	});

	it('should support streams', function (done) {
		server = http
			.createServer(function (req, res) {
				req.pipe(res);
			})
			.listen(4444, function () {
				axios
					.post('http://localhost:4444/', fs.createReadStream(__filename), {
						responseType: 'stream'
					})
					.then(function (res) {
						var stream = res.data;
						var string = '';
						stream.on('data', function (chunk) {
							string += chunk.toString('utf8');
						});
						stream.on('end', function () {
							assert.equal(string, fs.readFileSync(__filename, 'utf8'));
							done();
						});
					});
			});
	});

	it('should pass errors for a failed stream', function (done) {
		var notExitPath = path.join(__dirname, 'does_not_exist');

		server = http
			.createServer(function (req, res) {
				req.pipe(res);
			})
			.listen(4444, function () {
				axios
					.post('http://localhost:4444/', fs.createReadStream(notExitPath))
					.then(function (res) {
						assert.fail();
					})
					.catch(function (err) {
						assert.equal(err.message, `ENOENT: no such file or directory, open \'${notExitPath}\'`);
						done();
					});
			});
	});

	it('should support buffers', function (done) {
		var buf = Buffer.alloc(1024, 'x'); // Unsafe buffer < Buffer.poolSize (8192 bytes)
		server = http
			.createServer(function (req, res) {
				assert.equal(req.headers['content-length'], buf.length.toString());
				req.pipe(res);
			})
			.listen(4444, function () {
				axios
					.post('http://localhost:4444/', buf, {
						responseType: 'stream'
					})
					.then(function (res) {
						var stream = res.data;
						var string = '';
						stream.on('data', function (chunk) {
							string += chunk.toString('utf8');
						});
						stream.on('end', function () {
							assert.equal(string, buf.toString());
							done();
						});
					});
			});
	});

	it('should support HTTP proxies', function (done) {
		server = http
			.createServer(function (req, res) {
				res.setHeader('Content-Type', 'text/html; charset=UTF-8');
				res.end('12345');
			})
			.listen(4444, function () {
				proxy = http
					.createServer(function (request, response) {
						var parsed = url.parse(request.url);
						var opts = {
							host: parsed.hostname,
							port: parsed.port,
							path: parsed.path
						};

						http.get(opts, function (res) {
							var body = '';
							res.on('data', function (data) {
								body += data;
							});
							res.on('end', function () {
								response.setHeader('Content-Type', 'text/html; charset=UTF-8');
								response.end(body + '6789');
							});
						});
					})
					.listen(4000, function () {
						axios
							.get('http://localhost:4444/', {
								proxy: {
									host: 'localhost',
									port: 4000
								}
							})
							.then(function (res) {
								assert.equal(res.data, '123456789', 'should pass through proxy');
								done();
							});
					});
			});
	});

	it('should support HTTPS proxies', function (done) {
		var options = {
			key: fs.readFileSync(path.join(__dirname, 'key.pem')),
			cert: fs.readFileSync(path.join(__dirname, 'cert.pem'))
		};

		server = https
			.createServer(options, function (req, res) {
				res.setHeader('Content-Type', 'text/html; charset=UTF-8');
				res.end('12345');
			})
			.listen(4444, function () {
				proxy = https
					.createServer(options, function (request, response) {
						var parsed = url.parse(request.url);
						var opts = {
							host: parsed.hostname,
							port: parsed.port,
							path: parsed.path,
							protocol: parsed.protocol,
							rejectUnauthorized: false
						};

						https.get(opts, function (res) {
							var body = '';
							res.on('data', function (data) {
								body += data;
							});
							res.on('end', function () {
								response.setHeader('Content-Type', 'text/html; charset=UTF-8');
								response.end(body + '6789');
							});
						});
					})
					.listen(4000, function () {
						axios
							.get('https://localhost:4444/', {
								proxy: {
									host: 'localhost',
									port: 4000,
									protocol: 'https'
								},
								httpsAgent: new https.Agent({
									rejectUnauthorized: false
								})
							})
							.then(function (res) {
								assert.equal(res.data, '123456789', 'should pass through proxy');
								done();
							})
							.catch(function (err) {
								assert.fail(err);
								done();
							});
					});
			});
	});

	it('should not pass through disabled proxy', function (done) {
		// set the env variable
		process.env.http_proxy = 'http://does-not-exists.example.com:4242/';

		server = http
			.createServer(function (req, res) {
				res.setHeader('Content-Type', 'text/html; charset=UTF-8');
				res.end('123456789');
			})
			.listen(4444, function () {
				axios
					.get('http://localhost:4444/', {
						proxy: false
					})
					.then(function (res) {
						assert.equal(res.data, '123456789', 'should not pass through proxy');
						done();
					});
			});
	});

	it('should support proxy set via env var', function (done) {
		server = http
			.createServer(function (req, res) {
				res.setHeader('Content-Type', 'text/html; charset=UTF-8');
				res.end('4567');
			})
			.listen(4444, function () {
				proxy = http
					.createServer(function (request, response) {
						var parsed = url.parse(request.url);
						var opts = {
							host: parsed.hostname,
							port: parsed.port,
							path: parsed.path
						};

						http.get(opts, function (res) {
							var body = '';
							res.on('data', function (data) {
								body += data;
							});
							res.on('end', function () {
								response.setHeader('Content-Type', 'text/html; charset=UTF-8');
								response.end(body + '1234');
							});
						});
					})
					.listen(4000, function () {
						// set the env variable
						process.env.http_proxy = 'http://localhost:4000/';

						axios.get('http://localhost:4444/').then(function (res) {
							assert.equal(res.data, '45671234', 'should use proxy set by process.env.http_proxy');
							done();
						});
					});
			});
	});

	it('should support HTTPS proxy set via env var', function (done) {
		var options = {
			key: fs.readFileSync(path.join(__dirname, 'key.pem')),
			cert: fs.readFileSync(path.join(__dirname, 'cert.pem'))
		};

		server = https
			.createServer(options, function (req, res) {
				res.setHeader('Content-Type', 'text/html; charset=UTF-8');
				res.end('12345');
			})
			.listen(4444, function () {
				proxy = https
					.createServer(options, function (request, response) {
						var parsed = url.parse(request.url);
						var opts = {
							host: parsed.hostname,
							port: parsed.port,
							path: parsed.path,
							protocol: parsed.protocol,
							rejectUnauthorized: false
						};

						https.get(opts, function (res) {
							var body = '';
							res.on('data', function (data) {
								body += data;
							});
							res.on('end', function () {
								response.setHeader('Content-Type', 'text/html; charset=UTF-8');
								response.end(body + '6789');
							});
						});
					})
					.listen(4000, function () {
						process.env.https_proxy = 'https://localhost:4000/';

						axios
							.get('https://localhost:4444/', {
								httpsAgent: new https.Agent({
									rejectUnauthorized: false
								})
							})
							.then(function (res) {
								assert.equal(res.data, '123456789', 'should pass through proxy');
								done();
							})
							.catch(function (err) {
								assert.fail(err);
								done();
							})
							.finally(function () {
								process.env.https_proxy = '';
							});
					});
			});
	});

	it('should not use proxy for domains in no_proxy', function (done) {
		server = http
			.createServer(function (req, res) {
				res.setHeader('Content-Type', 'text/html; charset=UTF-8');
				res.end('4567');
			})
			.listen(4444, function () {
				proxy = http
					.createServer(function (request, response) {
						var parsed = url.parse(request.url);
						var opts = {
							host: parsed.hostname,
							port: parsed.port,
							path: parsed.path
						};

						http.get(opts, function (res) {
							var body = '';
							res.on('data', function (data) {
								body += data;
							});
							res.on('end', function () {
								response.setHeader('Content-Type', 'text/html; charset=UTF-8');
								response.end(body + '1234');
							});
						});
					})
					.listen(4000, function () {
						// set the env variable
						process.env.http_proxy = 'http://localhost:4000/';
						process.env.no_proxy = 'foo.com, localhost,bar.net , , quix.co';

						axios.get('http://localhost:4444/').then(function (res) {
							assert.equal(res.data, '4567', 'should not use proxy for domains in no_proxy');
							done();
						});
					});
			});
	});

	it('should use proxy for domains not in no_proxy', function (done) {
		server = http
			.createServer(function (req, res) {
				res.setHeader('Content-Type', 'text/html; charset=UTF-8');
				res.end('4567');
			})
			.listen(4444, function () {
				proxy = http
					.createServer(function (request, response) {
						var parsed = url.parse(request.url);
						var opts = {
							host: parsed.hostname,
							port: parsed.port,
							path: parsed.path
						};

						http.get(opts, function (res) {
							var body = '';
							res.on('data', function (data) {
								body += data;
							});
							res.on('end', function () {
								response.setHeader('Content-Type', 'text/html; charset=UTF-8');
								response.end(body + '1234');
							});
						});
					})
					.listen(4000, function () {
						// set the env variable
						process.env.http_proxy = 'http://localhost:4000/';
						process.env.no_proxy = 'foo.com, ,bar.net , quix.co';

						axios.get('http://localhost:4444/').then(function (res) {
							assert.equal(res.data, '45671234', 'should use proxy for domains not in no_proxy');
							done();
						});
					});
			});
	});

	it('should support HTTP proxy auth', function (done) {
		server = http
			.createServer(function (req, res) {
				res.end();
			})
			.listen(4444, function () {
				proxy = http
					.createServer(function (request, response) {
						var parsed = url.parse(request.url);
						var opts = {
							host: parsed.hostname,
							port: parsed.port,
							path: parsed.path
						};
						var proxyAuth = request.headers['proxy-authorization'];

						http.get(opts, function (res) {
							var body = '';
							res.on('data', function (data) {
								body += data;
							});
							res.on('end', function () {
								response.setHeader('Content-Type', 'text/html; charset=UTF-8');
								response.end(proxyAuth);
							});
						});
					})
					.listen(4000, function () {
						axios
							.get('http://localhost:4444/', {
								proxy: {
									host: 'localhost',
									port: 4000,
									auth: {
										username: 'user',
										password: 'pass'
									}
								}
							})
							.then(function (res) {
								var base64 = Buffer.from('user:pass', 'utf8').toString('base64');
								assert.equal(res.data, 'Basic ' + base64, 'should authenticate to the proxy');
								done();
							});
					});
			});
	});

	it('should support proxy auth from env', function (done) {
		server = http
			.createServer(function (req, res) {
				res.end();
			})
			.listen(4444, function () {
				proxy = http
					.createServer(function (request, response) {
						var parsed = url.parse(request.url);
						var opts = {
							host: parsed.hostname,
							port: parsed.port,
							path: parsed.path
						};
						var proxyAuth = request.headers['proxy-authorization'];

						http.get(opts, function (res) {
							var body = '';
							res.on('data', function (data) {
								body += data;
							});
							res.on('end', function () {
								response.setHeader('Content-Type', 'text/html; charset=UTF-8');
								response.end(proxyAuth);
							});
						});
					})
					.listen(4000, function () {
						process.env.http_proxy = 'http://user:pass@localhost:4000/';

						axios.get('http://localhost:4444/').then(function (res) {
							var base64 = Buffer.from('user:pass', 'utf8').toString('base64');
							assert.equal(
								res.data,
								'Basic ' + base64,
								'should authenticate to the proxy set by process.env.http_proxy'
							);
							done();
						});
					});
			});
	});

	it('should support proxy auth with header', function (done) {
		server = http
			.createServer(function (req, res) {
				res.end();
			})
			.listen(4444, function () {
				proxy = http
					.createServer(function (request, response) {
						var parsed = url.parse(request.url);
						var opts = {
							host: parsed.hostname,
							port: parsed.port,
							path: parsed.path
						};
						var proxyAuth = request.headers['proxy-authorization'];

						http.get(opts, function (res) {
							var body = '';
							res.on('data', function (data) {
								body += data;
							});
							res.on('end', function () {
								response.setHeader('Content-Type', 'text/html; charset=UTF-8');
								response.end(proxyAuth);
							});
						});
					})
					.listen(4000, function () {
						axios
							.get('http://localhost:4444/', {
								proxy: {
									host: 'localhost',
									port: 4000,
									auth: {
										username: 'user',
										password: 'pass'
									}
								},
								headers: {
									'Proxy-Authorization': 'Basic abc123'
								}
							})
							.then(function (res) {
								var base64 = Buffer.from('user:pass', 'utf8').toString('base64');
								assert.equal(res.data, 'Basic ' + base64, 'should authenticate to the proxy');
								done();
							});
					});
			});
	});

	it('should support cancel', function (done) {
		var source = axios.CancelToken.source();
		server = http
			.createServer(function (req, res) {
				// call cancel() when the request has been sent, but a response has not been received
				source.cancel('Operation has been canceled.');
			})
			.listen(4444, function () {
				axios
					.get('http://localhost:4444/', {
						cancelToken: source.token
					})
					.catch(function (thrown) {
						assert.ok(
							thrown instanceof axios.Cancel,
							'Promise must be rejected with a Cancel object'
						);
						assert.equal(thrown.message, 'Operation has been canceled.');
						done();
					});
			});
	});

	it('should combine baseURL and url', function (done) {
		server = http
			.createServer(function (req, res) {
				res.end();
			})
			.listen(4444, function () {
				axios
					.get('/foo', {
						baseURL: 'http://localhost:4444/'
					})
					.then(function (res) {
						assert.equal(res.config.baseURL, 'http://localhost:4444/');
						assert.equal(res.config.url, '/foo');
						done();
					});
			});
	});

	it('should supply a user-agent if one is not specified', function (done) {
		server = http
			.createServer(function (req, res) {
				assert.equal(req.headers['user-agent'], 'axios/' + pkg.version);
				res.end();
			})
			.listen(4444, function () {
				axios.get('http://localhost:4444/').then(function (res) {
					done();
				});
			});
	});

	it('should omit a user-agent if one is explicitly disclaimed', function (done) {
		server = http
			.createServer(function (req, res) {
				assert.equal('user-agent' in req.headers, false);
				assert.equal('User-Agent' in req.headers, false);
				res.end();
			})
			.listen(4444, function () {
				axios
					.get('http://localhost:4444/', {
						headers: {
							'User-Agent': null
						}
					})
					.then(function (res) {
						done();
					});
			});
	});
});

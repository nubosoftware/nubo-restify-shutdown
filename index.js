"use strict";

const REQUEST_TIMEOUT = 60000;
const WAIT_ON_SHUTDOWN = 30000;

function shutdown(options, server) {

    var sockets = {};
    var inShutdown = false;
    var close;
    var options;
    var logger;

    if (!server) {
        server = options;
        options = {}
    }

    close = server.close;

    if (options && options.logger) {
        logger = options.logger;
    }

    server.on('connection', function(socket) {


        var key = socket.remoteAddress + ':' + socket.remotePort;

        sockets[key] = {
            socket: socket,
            handled: false,
            routed: false,
            path: "",
            createTime: Date.now()
        }

        socket.on('close',function(){
            /*if (logger) {
                logger.info("Socket closed: "+key+" "+sockets[key].path);
            }*/
            delete sockets[key];
        });

        //console.log("connection: " + key)

    });


    server.pre(function(req, res, next) {

        var key = req.connection.remoteAddress + ':' + req.connection.remotePort;
        if (sockets[key]) {
            sockets[key].handled = false;
            sockets[key].routed = true;
            sockets[key].path = req.path(req.url);
            sockets[key].routeTime = Date.now();
        }
        req.setTimeout(REQUEST_TIMEOUT);


        res.on('finish', function() {
            if (sockets[key]) {
                sockets[key].handled = true;
                sockets[key].routed = true;
                /*if (logger) {
                    logger.info("Finish: "+key+" "+sockets[key].path);
                }*/
                // console.log('finish: ' + key)
                if (inShutdown) {
                    closeConnections();
                }
            }
        });

        res.on('close', function() {
            if (sockets[key]) {
                sockets[key].handled = true;
                sockets[key].routed = true;
                /*if (logger) {
                    logger.info("Close: "+key+" "+sockets[key].path);
                }*/
                if (inShutdown) {
                    closeConnections();
                }
            }
        });

        next();
    });

    server.close = function() {

        logger ? logger.info("restifyShutdown: closing server ...") : null;

        close.apply(this, arguments)

        inShutdown = true;

        closeConnections();

    }

    function closeConnections() {

        //logger ? logger.info(`restifyShutdown: Checking ${Object.keys(sockets).length} connections` ) : null;
        for (var key in sockets) {
            if (sockets[key].handled === true) {
                //console.log("end: " + key)
                sockets[key].socket.destroy();
                delete sockets[key]

            } else if (sockets[key].routed === true) {
                let elapsed = Date.now() - sockets[key].routeTime ;
                if (elapsed < WAIT_ON_SHUTDOWN) {
                    logger ? logger.info("restifyShutdown: waiting for " + key + sockets[key].path) : null;
                } else {
                    logger ? logger.info(`restifyShutdown: killing connection after more than ${WAIT_ON_SHUTDOWN/1000} seconds: ${key} ${sockets[key].path}`) : null;
                    sockets[key].socket.destroy();
                    delete sockets[key]
                }
            } else {

                sockets[key].socket.destroy();
                delete sockets[key]
            }
        }

        if (Object.keys(sockets).length > 0) {
            setTimeout(function() {
                closeConnections();
            }, 3000);
        } else {
            logger ? logger.info("restifyShutdown: All connection closed") : null;
        }
    }

}

module.exports = shutdown;
/**
 * Created by nessphoro on 6/11/15.
 */
var crypto = require("crypto");
var asyncblock = require("asyncblock");
var ssh2 = require('ssh2');
var child_process = require("child_process");
var fs = require("fs");
var async = require("async");
function getRemoteLocalPair(file) {
    switch (typeof file) {
        case "string":
            if (file.indexOf("/") != -1) {
                return { local: file, remote: file.split("/")[-1] };
            }
            else {
                return { local: file, remote: file };
            }
            break;
        case "object":
            for (var local in file) {
                return { local: local, remote: file[local] };
            }
            break;
    }
}
function handleRemoteShell(shellFile, sshClient, flow) {
    console.log("\tExecuting...");
    handleCommandStage(shellFile, sshClient, flow);
}
function handleCommandStage(shellFile, sshClient, flow) {
    sshClient.exec("/bin/bash -x " + shellFile, flow.add("exec", ["stream"]));
    var result = flow.wait("exec");
    result.stream.on("close", flow.add("exit", ["code", "signal"]));
    result.stream.on("data", function (buffer) {
        var lines = buffer.toString().split("\n");
        lines.forEach(function (line) {
            line = line.replace("\n", "");
            if (line === "")
                return;
            console.log("\t>" + line);
        });
    });
    result = flow.wait("exit").code;
    if (result !== undefined && result != 0) {
        throw "FAILED: non-zero exit code " + result;
    }
    sshClient.exec("/bin/rm " + shellFile, flow.add("rm"));
    flow.wait("rm");
}
function buildShellScript(config, file) {
    var deployScript = "";
    if (config.deploy_env) {
        console.log("Processing deploy environment");
        deployScript += "cd $HOME\n";
        config.deploy_env.forEach(function (file) {
            for (var v in file) {
                var value = file[v];
                if (value[0] == "@") {
                    value = value.substr(1);
                    deployScript += "export " + v + "=$(cat " + value + ")\n";
                }
                else {
                    deployScript += "export " + v + "=" + value + "\n";
                }
            }
        });
        deployScript += "echo \"Done with the envrionment\" \n";
    }
    if (config.deploy) {
        config.deploy.forEach(function (command) {
            deployScript += command + "\n";
        });
    }
    deployScript += "echo \"Done\"\nexit\n";
    fs.writeFile(file, deployScript);
}
function processServer(config, server, options, flow) {
    if (server.indexOf("ssh://") != 0) {
        throw "FAILED: Only SSH is support as the server protocol: " + server;
    }
    server = server.substr(6);
    var usrSplit = server.split("@");
    server = usrSplit.length > 1 ? usrSplit[1] : usrSplit[0];
    var user = usrSplit.length > 1 ? usrSplit[0] : process.env.USER;
    var portSplit = server.split(":");
    server = portSplit[0];
    var port = portSplit.length > 1 ? portSplit[1] : 22;
    console.log("Processing  " + user + "@" + server + ":" + port);
    var sshClient = new ssh2.Client();
    sshClient.on("ready", flow.add("ready"));
    sshClient.on("error", flow.add("error"));
    sshClient.connect({
        host: server,
        port: port,
        user: user,
        privateKey: fs.readFileSync(options.keyFile),
        passphrase: options.passphrase
    });
    flow.wait("ready");
    console.log("\tConnected");
    console.log("\tUploading");
    sshClient.sftp(flow.add("sftp", ["sftp"]));
    var results = flow.wait("sftp");
    config.files.forEach(function (file, index) {
        var pair = getRemoteLocalPair(file);
        results.sftp.fastPut(pair.local, pair.remote, flow.add("upload"));
        var err = flow.wait("upload");
        if (err) {
            throw err;
        }
        if (index != config.files.length - 1)
            console.log("\t\t" + pair.local);
    });
    console.log("\tUploaded");
    handleRemoteShell(getRemoteLocalPair(config.files[config.files.length - 1]).remote, sshClient, flow);
    sshClient.end();
}
function executeConfiguration(config, options) {
    if (config.prepare) {
        var prepareEnv = {};
        for (var v in process.env) {
            prepareEnv[v] = process.env[v];
        }
        if (config.prepare_env) {
            config.prepare_env.forEach(function (ev) {
                for (var v in ev) {
                    var value = ev[v];
                    if (value[0] == "@") {
                        value = value.substr(1);
                        value = fs.readFileSync(value, 'utf8');
                    }
                    prepareEnv[v] = value;
                }
            });
        }
        config.prepare.forEach(function (command) {
            console.log(">", command);
            var out = child_process.execSync(command, { env: prepareEnv });
        });
    }
    var shellScriptName = "/tmp/" + crypto.randomBytes(16).toString('hex');
    var shellMap = {};
    buildShellScript(config, shellScriptName);
    shellMap[shellScriptName] = shellScriptName;
    config.files.push(shellMap);
    var failedServers = [];
    async.eachSeries(config.servers, function (server, callback) {
        function errorCallback(error) {
            console.error("Error:");
            console.error(error);
            if (options.strict) {
                fs.unlinkSync(shellScriptName);
                console.error("Strict Mode On, Exiting.");
                process.exit(1);
            }
            else {
                failedServers.push(server);
                console.log("Trying next server");
                callback();
            }
        }
        asyncblock(function (flow) {
            flow.errorCallback = errorCallback;
            processServer(config, server, options, flow);
        }, callback);
    }, function () {
        fs.unlinkSync(shellScriptName);
        if (!options.strict) {
            if (failedServers.length != 0) {
                console.log("Deploy was semi-successful, failed " + failedServers.length + "/" + config.servers.length);
                console.log("Failing servers:");
                failedServers.forEach(function (server) {
                    console.log("\t" + server);
                });
                return;
            }
        }
        console.log("Everything deployed successfully");
    });
}
exports.executeConfiguration = executeConfiguration;

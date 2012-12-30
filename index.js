var fs = require('fs');
var request = require('request');
var JSONStream = require('JSONStream');
var EventEmitter = require('events').EventEmitter;

module.exports = function (file, cb) {
    fs.statSync(file, function (err, stat) {
        if (err) return cb(new Sync(0, file))
        
        var since = stat.mtime.valueOf();
        var sync = new Sync(since, file);
        
        fs.readFile(file, 'utf8', function (err, src) {
            if (err) return cb(sync);
            try { sync.packages.splice(0, 0, JSON.parse(src)) }
            catch (err) { return }
            cb(sync);
        });
    });
};

function Sync (mtime, file) {
    this.packages = [];
    this.file = file;
    this.since = mtime;
}

inherits(Sync, EventEmitter);

Sync.prototype.update = function (filter) {
    var self = this;
    var u = 'http://registry.npmjs.org/-/all/since?startkey&=' + self.since;
    var r = request(u);
    
    var parser = JSONStream.parse([ true ]);
    r.pipe(parser);
    
    var index = Object.keys(self.packages)
        .reduce(function (acc, key, ix) {
            acc[key] = ix;
            return acc;
        }, {})
    ;
    
    var offset = 0;
    parser.on('data', function (row) {
        var ix = index[row.name];
        if (ix !== undefined) {
            self.packages.splice(ix + offset, 1);
        }
        if (filter) {
            var res = filter(row);
            if (res) self.packages.unshift(res);
        }
        else self.packages.unshift(row);
        offset ++;
    });
    
    parser.on('end', function () {
        self.since = Date.now();
        self.emit('sync');
        
        var src = JSON.stringify(self.packages);
        fs.writeFile(self.file + '_', src, function (err) {
            if (err) return self.emit('error', err)
            
            fs.rename(self.file + '_', self.file, function (err) {
                if (err) self.emit('error', err)
            });
        });
    });
};

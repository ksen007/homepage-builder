var KMS = {};
(function (module) {

    var modified = false;
    var contents = {};
    var isContentsEncrypted = true;
    var KMSMAIN = '#kms-main';
    var pagePrefix;
    var SEPARATOR = "<!-- KMS Contents -->";
    var encString = "***x***";


    /********************************************************************/

    function loadScriptsOnce(scriptList, globalVar, cb) {
        if (typeof window[globalVar] === 'undefined') {

            function getScript(url, success) {
                var script = document.createElement('script');
                script.src = url;
                var head = document.getElementsByTagName('head')[0],
                    done = false;

                script.onload = script.onreadystatechange = function () {
                    if (!done && (!this.readyState || this.readyState == 'loaded' || this.readyState == 'complete')) {
                        done = true;
                        script.onload = script.onreadystatechange = null;
                        head.removeChild(script);
                        success();
                    }

                };
                head.appendChild(script);
            }

            function getScriptAt(sList, i, success) {
                if (i === sList.length) {
                    success();
                } else {
                    getScript(sList[i], function () {
                        getScriptAt(sList, i + 1, success);
                    })
                }
            }

            getScriptAt(scriptList, 0, cb);

        } else {
            cb();
        }
    }

    /********************************************************************/
    var pCounter = 0;

    function getPass(id) {
        var href = window.location.href;
        var hashIndex = href.indexOf("#");
        if (hashIndex > 0) {
            href = href = href.substring(0, hashIndex);
        }
        var key = href + ":" + id;
        var currVal = document.getElementById(id).value;
        if (currVal !== undefined && currVal.length > 0) {
            localStorage.setItem(key, CryptoJS.AES.encrypt(currVal, id));
            return currVal;
        } else {
            var oldVal = localStorage.getItem(key);
            if (oldVal && pCounter === 2) {
                var pass = CryptoJS.AES.decrypt(oldVal, id);
                if (pass.sigBytes > 0) {
                    var clearPass = pass.toString(CryptoJS.enc.Utf8);
                    document.getElementById(id).value = clearPass;
                    return clearPass;
                }
            }
            return currVal;
        }
    }

    /********************************************************************/

    function isEnc(transformers) {
        var pos = transformers.lastIndexOf('.');
        if (pos >= 0) {
            var prefix = transformers.substring(0, pos);
            pos = prefix.lastIndexOf('.');
            var ext = prefix.substring(pos);
            return ext === '.enc';
        }
        return false;
    }


    function encrypt(text, type) {
        var key1 = getPass('kms-key1');
        var key2 = getPass('kms-key2');

        if (isEnc(type)) {
            if (key1.length > 0 && key1 === key2) {
                return CryptoJS.AES.encrypt(text, key1).toString();
            } else {
                BootstrapDialog.show({
                    type: BootstrapDialog.TYPE_WARNING,
                    title: 'Error',
                    message: 'Encryption password is either unavailable or there is a mismatch.'
                });
                return null;
            }
        } else {
            return text;
        }
    }

    function decrypt(text, type) {
        if (text === "") {
            return text;
        }
        var key = getPass('kms-key1');

        if (isEnc(type)) {
            if (key.length > 0) {
                var decrypted = CryptoJS.AES.decrypt(text, key);
                if (decrypted.sigBytes < 0) {
                    console.log("Decryption failed.");
                    return null;
                }
                return decrypted.toString(CryptoJS.enc.Utf8);
            } else {
                console.log("Password empty or mismatch.");
                return encString;
            }
        } else {
            return text;
        }
    }

    /*******************************************************************
     * Plugin related functions
     */

    var markdown = new Showdown.converter();

    var creole = (function () {
        var creole = new Parse.Simple.Creole();
        var div = $('<div></div>div>');

        return function (str) {
            div.html('');
            creole.parse(div[0], str);
            return div.html();
        }
    }());

    function escapeHtml(string) {
        return string.replace(/\n|\r\n|\r/g, '<br/>').replace(/ /g, '&nbsp;');
    }

    function identity(str) {
        return str;
    }

    var escapeMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '`': '&#x60;'
    };

    function invert(map) {
        var ret = {};
        for (var i in map) {
            if (map.hasOwnProperty(i)) {
                ret[map[i]] = i;
            }
        }
        return ret;
    }

    var unescapeMap = invert(escapeMap);

    var createEscaper = function (map) {
        var escaper = function (match) {
            return map[match];
        };

        var keys = [];
        for (var i in map) {
            if (map.hasOwnProperty(i)) {
                keys.push(i);
            }
        }
        var source = '(?:' + keys.join('|') + ')';
        var testRegexp = RegExp(source);
        var replaceRegexp = RegExp(source, 'g');
        return function (string) {
            string = string == null ? '' : '' + string;
            return testRegexp.test(string) ? string.replace(replaceRegexp, escaper) : string;
        };
    };

    var escape = createEscaper(escapeMap);
    var unescape = createEscaper(unescapeMap);

    var plugins = {
        '.txt': {
            mode: undefined, converter: function (str) {
                var ret = escapeHtml($('<div>').text(str).html());
                return ret;
            }
        },
        '.md': {
            mode: 'markdown', converter: function (str) {
                return markdown.makeHtml(str);
            }
        },
        '.wiki': {
            mode: undefined, converter: function (str) {
                return creole(str);
            }
        },
        '.js': {
            mode: 'javascript', converter: function (str) {
                return '<script type="text/javascript">' + str + '\x3C/script>';
            }
        },
        '.html': {
            mode: 'text/html', converter: function (str) {
                return str;
            }
        },
        '.css': {
            mode: 'css', converter: function (str) {
                return '\x3Cstyle type = "text/css" > ' + str + '\x3Cstyle>';
            }
        },
        '.php': {
            mode: "application/x-httpd-php", converter: function (str) {
                return '<code> ' + str + '</code>';
            }
        }
    };

    function setPlugin(type, mode, converter) {
        plugins[type] = {mode: mode, converter: converter};
    }

    function getPlugin(type) {
        return plugins[type];
    }


    function getParser(divid) {
        try {
            var pos = divid.lastIndexOf('.');
            if (pos >= 0) {
                var ext = divid.substring(pos);
                return plugins[ext].converter;
            } else {
                return identity;
            }
        } catch (e) {
            return identity;
        }
    }

    function getMode(divid) {
        try {
            var pos = divid.lastIndexOf('.');
            if (pos >= 0) {
                var ext = divid.substring(pos);
                return plugins[ext].mode;
            } else {
                return undefined;
            }
        } catch (e) {
            return undefined;
        }
    }


    /********************************************************************/

    function refreshContent(container) {
        var contentid = container[0].getAttribute('data-content');
        var type = container[0].getAttribute('data-type');
        var content = Content.getContent(contentid, type);
        var text = content.getText();

        var html, interHtml, oldTransformer;
        interHtml = getParser(content.getType())(text, content);
        oldTransformer = content.getTransformer();

        html = oldTransformer(interHtml);
        html = html.replace(/{{THISCONTENT}}/g, "KMS.Content.getContent('" + contentid + "','" + content.type + "')");
        container.html(html);
        if (content.getTransformer() !== oldTransformer) {
            html = content.getTransformer(interHtml);
            html = html.replace(/{{THISCONTENT}}/g, "KMS.Content.getContent('" + contentid + "','" + content.type + "')");
            container.html(html);
        }

        container.find('.kms-location').each(function (i) {
            var dis = $(this);
            refreshContent(dis);
        });
    }


    function Content(id, text, transformer, type, creationTime, updateTime) {
        this.id = id;
        this.text = text.replace(/&lt;(\/textarea>)/gi, "<$1");
        this.transformer = transformer;
        this.type = type;
        this.creationTime = creationTime;
        this.updateTime = updateTime;
    }

    Content.defaultTransformer = function (text) {
        var prefix =
            '<span class="glyphicon glyphicon-remove-circle pull-right" style="padding: 2px; display: none;" title="Cancel edit"  onclick="KMS.cancelAction(this,{{THISCONTENT}})"></span>' +
            '<span class="glyphicon glyphicon-check pull-right" style="padding: 2px; display: none;" title="Save"  onclick="KMS.saveAction(this,{{THISCONTENT}})"></span>' +
            '<span class="glyphicon glyphicon-edit pull-right" style="padding: 2px;" title="Edit" onclick="KMS.editAction(this,{{THISCONTENT}})"></span>' +
            '<textarea style="display: none"></textarea>' +
            '<div>';
        var suffix = '</div>';
        return prefix + text + suffix;
    };

    Content.getContent = function (id, type) {
        var content = contents[id];
        if (!content) {
            type = type || ".html";
            contents[id] = content = new Content(id, "", Content.defaultTransformer, type, Date.now(), Date.now());
        } else {
            content.type = type || content.type;
        }
        return content;
    };

    Content.deleteContent = function (id) {
        modified = true;
        delete contents[id];
    };

    Content.prototype.decrypt = function () {
        var txt = decrypt(this.text, this.type);
        if (txt === encString) {
            return false;
        } else {
            this.text = txt;
            return true;
        }
    };

    Content.prototype.getText = function () {
        if (isContentsEncrypted && isEnc(this.type)) {
            return encString;
        } else {
            return this.text;
        }
        //return decrypt(this.text, this.type);
    };

    Content.prototype.getType = function () {
        return this.type;
    };

    Content.prototype.setText = function (text) {
        //text = encrypt(text, this.type);
        if (text !== null) {
            this.text = text;
            this.updateTime = Date.now();
            $("div[data-content='" + this.id + "']").each(function (i) {
                refreshContent($(this));
            });
            modified = true;
            return true;
        }
        return false;
    };

    Content.prototype.getTransformer = function () {
        return this.transformer;
    };

    Content.prototype.setTransformer = function (transformer) {
        this.transformer = transformer;
    };

    Content.prototype.getCreationTime = function () {
        return this.creationTime;
    };

    Content.prototype.getUpdateTime = function () {
        return this.updateTime;
    };

    Content.prototype.getId = function () {
        return this.id;
    };

    Content.prototype.serialize = function () {
        var txt = encrypt(this.text, this.type);
        if (txt === null) {
            throw "Encryption failed";
        }
        return '\x3Ctextarea id="' + this.getId() +
            '" class="kms-content" data-type="' + this.getType() +
            '" data-creation-time="' + this.getCreationTime() +
            '" data-update-time="' + this.getUpdateTime() +
            '">' +
            txt.replace(/<(\/textarea>)/gi, '&lt;$1') +
            '\x3C/textarea>\n\n<!-- SEPARATOR -->\n';

    };

    /********************************************************************/


    function serializePage() {
        var ret = pagePrefix;
        ret = ret + SEPARATOR + "\n";
        for (var divid in contents) {
            if (contents.hasOwnProperty(divid)) {
                var content = contents[divid];
                ret = ret + content.serialize();
            }
        }
        ret = ret + '</body>\n</html>\n';
        return ret;
    }

    function saveerr(file) {
        BootstrapDialog.show({
            type: BootstrapDialog.TYPE_WARNING,
            title: 'Error',
            message: 'Cannot save ' + file
        });
        console.log("Error");
    }


    function savePageAux(file, str) {
        var data = {file: file, content: str, action: 'write', password: getPass('kms-password')};

        console.log("Saving " + file + " ... ");
        $.ajax({
            url: module.URL,
            type: 'POST',
            data: data,
            success: function (result) {
                result = $.parseJSON(result);
                if (!result.success) {
                    console.log(result.message);
                    saveerr(file);
                } else {
                    modified = false;
                    console.log("Success");
                    console.log(result['data']);
                    BootstrapDialog.show({
                        message: 'Successfully saved ' + data.file
                    });
                }
            },
            error: function () {
                saveerr(file);
            }
        })

    }

    function loadTemplate(promise) {
        function err() {
            BootstrapDialog.show({
                type: BootstrapDialog.TYPE_WARNING,
                title: 'Error',
                message: 'Cannot read ' + document.location.href
            });
            console.log("Error");
        }

        $.ajax({
            url: document.location.href,
            type: 'GET',
            success: function (result) {
                pagePrefix = result.substring(0, result.indexOf(SEPARATOR));
                promise();
            },
            error: err
        })
    }

    function getCurrentFileName() {
        var parser = document.createElement('a');
        parser.href = document.location.href;
        var file = parser.pathname.substring(1);
        if (file.indexOf('~') === 0) {
            file = file.substring(file.indexOf('/') + 1);
        }
        return file;
    }

    function savePage2() {
        var file = getCurrentFileName();
        var econtent;
        econtent = serializePage();
        savePageAux(file, econtent);
    }


    function download2() {
        var text = serializePage();
        var filename = getCurrentFileName();
        var pom = document.createElement('a');
        pom.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
        pom.setAttribute('download', filename);

        pom.style.display = 'none';
        document.body.appendChild(pom);

        pom.click();

        document.body.removeChild(pom);
    }


    function newPage2() {
        var ret = pagePrefix;
        ret = ret + SEPARATOR + "\n";
        ret = ret + '</body>\n</html>\n';
        savePageAux($('#kms-file').val(), ret);
    }


    function savePageAs2() {
        var econtent;
        econtent = serializePage();
        savePageAux($('#kms-file').val(), econtent);
    }


    function download() {
        loadTemplate(download2);
    }

    function savePage() {
        loadTemplate(savePage2);
    }

    function savePageAs() {
        loadTemplate(savePageAs2);
    }

    function newPage() {
        loadTemplate(newPage2);
    }

    function listContentsForDeletion() {
        var e = $('#kms-list');
        if (e.size() > 0) {
            e.remove();
        } else {
            var html = '<ul id="kms-list">';
            for (var divid in contents) {
                if (contents.hasOwnProperty(divid)) {
                    var content = contents[divid];
                    html = html + '<li><a href="#!trash=' + divid + content.type + '">[Remove] ' + escape(content.getText().substring(0, 40)) + '</a></li>\n';
                }
            }
            html = html + '</ul>';
            e.remove();
            $('body').append($(html));
        }
    }

    function incCount() {
        pCounter++;
    }

    function refreshPage() {
        decryptContents();
        refreshContent($(KMSMAIN));
        $(window).trigger('hashchange');
    }


    module.savePage = savePage;
    module.savePageAs = savePageAs;
    module.newPage = newPage;
    module.download = download;
    module.listContents = listContentsForDeletion;
    module.incCount = incCount;
    module.refreshPage = refreshPage;

    /********************************************************************/

    var currentAnchorMap = {};
    var anchorLoadDefault = '';

    function setAnchorLoadDefault(s) {
        currentAnchorMap = {};
        anchorLoadDefault = s;
    }


    function anchorLoadChange() {
        var hash = window.location.hash, k;
        if (hash === '') {
            hash = anchorLoadDefault;
        }
        console.log("Hashchange " + hash);
        if (hash.indexOf('#!') == 0) {
            hash = hash.substring(2);
            var anchorMap = {};
            var kvs = hash.split('&');
            for (var i = 0; i < kvs.length; i++) {
                var kv = kvs[i].split('=');
                anchorMap[kv[0]] = kv[1];
            }

            for (k in anchorMap) {
                if (anchorMap.hasOwnProperty(k)) {
                    //if (currentAnchorMap[k] !== anchorMap[k]) {
                        var idtype = anchorMap[k];
                        var id = idtype.substring(0, idtype.indexOf("."));
                        var type = idtype.substring(idtype.indexOf("."));
                        if (k === 'trash') {
                            Content.deleteContent(id);
                        } else {
                            var container = $('#' + k);
                            container[0].setAttribute('data-content', id);
                            container[0].setAttribute('data-type', type);
                            refreshContent(container);
                        }
                    //}
                }
            }
            for (k in currentAnchorMap) {
                if (currentAnchorMap.hasOwnProperty(k) && !anchorMap.hasOwnProperty(k)) {
                    $('#' + k).empty();
                }
            }
            currentAnchorMap = anchorMap;
        }
    }

    /********************************************************************/

    function initUploader() {
        $("#kms-drop-area-div").dmUploader({
            url: module.URL,
            extraData: {
                'action': 'upload', get directory() {
                    return $('#kms-file').val();
                }, get password() {
                    return getPass('kms-password');
                }
            },
            fileName: 'uploaded',
            onInit: function () {
                console.log('Plugin successfully initialized');
            },
            onUploadSuccess: function (id, data) {
                data = $.parseJSON(data);

                var outcome = data.success;
                if (outcome) {
                    console.log('Successfully upload #' + id);
                    console.log('Server response was:');
                    console.log(data.message);
                    BootstrapDialog.show({
                        message: 'Successfully uploaded. '
                    });
                } else {
                    console.log(data.message);
                    BootstrapDialog.show({
                        type: BootstrapDialog.TYPE_WARNING,
                        message: 'Upload failed. '
                    });
                }
            },
            onComplete: function () {
                console.log('We reach the end of the upload Queue!');
            }
        });
    }

    /********************************************************************/

    var codeMirrorSrcUrls = ["libkms/codemirror.min.js",
        "libkms/css.min.js",
        "libkms/javascript.min.js",
        "libkms/xml.min.js",
        "libkms/htmlembedded.min.js",
        "libkms/clike.min.js",
        "libkms/php.min.js",
        "libkms/markdown.min.js",
        "libkms/matchbrackets.min.js",
        "libkms/fullscreen.min.js"
    ];

    function saveAction(e, content) {
        loadScriptsOnce(codeMirrorSrcUrls, 'CodeMirror', function () {
            var siblings = $(e).siblings();
            var $buttonCancel = $(siblings[0]);
            var $buttonSave = $(e);
            var $buttonEdit = $(siblings[1]);
            var $divtext = $(siblings[2]);
            var $divhtml = $(siblings[4]);
            var editor = $divtext[0].editor;

            if (content.setText(editor.getValue())) {
                $buttonEdit.show();
                $buttonSave.hide();
                $buttonCancel.hide();
                editor.toTextArea();
                $divtext.hide();
                $divhtml.show();
                $divtext[0].editor = undefined;
            }
        });
    }

    function editAction(e, content) {
        loadScriptsOnce(codeMirrorSrcUrls, 'CodeMirror', function () {
            var dec = content.getText();
            if (dec !== encString) {
                var siblings = $(e).siblings();
                var $buttonCancel = $(siblings[0]);
                var $buttonSave = $(siblings[1]);
                var $buttonEdit = $(e);
                var $divtext = $(siblings[2]);
                var $divhtml = $(siblings[3]);


                $buttonSave.show();
                $buttonCancel.show();
                $buttonEdit.hide();
                $divhtml.hide();
                var editor = CodeMirror.fromTextArea($divtext[0], {
                    mode: getMode(content.getType()),
                    theme: "default",
                    lineWrapping: true,
                    matchBrackets: true,
                    indentUnit: 4,
                    indentWithTabs: true,
                    extraKeys: {
                        "Ctrl-Enter": function (cm) {
                            cm.setOption("fullScreen", !cm.getOption("fullScreen"));
                        },
                        "Esc": function (cm) {
                            if (cm.getOption("fullScreen")) cm.setOption("fullScreen", false);
                        }
                    }
                });
                $divtext[0].editor = editor;
                editor.setValue(dec);
            } else {
                BootstrapDialog.show({
                    type: BootstrapDialog.TYPE_WARNING,
                    title: 'Warning',
                    message: 'Cannot edit encrypted data before decryption.'
                });
            }
        });
    }


    function cancelAction(e, content) {
        loadScriptsOnce(codeMirrorSrcUrls, 'CodeMirror', function () {
            var siblings = $(e).siblings();
            var $buttonCancel = $(e);
            var $buttonSave = $(siblings[0]);
            var $buttonEdit = $(siblings[1]);
            var $divtext = $(siblings[2]);
            var $divhtml = $(siblings[4]);
            var editor = $divtext[0].editor;

            var text = editor.getValue();
            var oldText = content.getText();
            if (text === oldText) {
                $buttonEdit.show();
                $buttonSave.hide();
                $buttonCancel.hide();
                editor.toTextArea();
                $divtext.hide();
                $divhtml.show();
                $divtext[0].editor = undefined;
            } else {
                BootstrapDialog.show({
                    type: BootstrapDialog.TYPE_WARNING,
                    title: 'Close',
                    message: 'Content modified. Really close?',
                    buttons: [{
                        label: 'Close',
                        action: function (dialog) {
                            dialog.close();
                            $buttonEdit.show();
                            $buttonSave.hide();
                            $buttonCancel.hide();
                            editor.toTextArea();
                            $divtext.hide();
                            $divhtml.show();
                            $divtext[0].editor = undefined;
                        }
                    }, {
                        label: 'Cancel',
                        action: function (dialog) {
                            dialog.close();
                        }
                    }]
                });
            }
        });
    }

    module.editAction = editAction;
    module.saveAction = saveAction;
    module.cancelAction = cancelAction;

    /********************************************************************/

    function collectContents() {
        $('.kms-content').each(
            function (i) {
                var tmp = $(this);
                contents[this.id] = new Content(
                    this.id,
                    tmp.text(),
                    Content.defaultTransformer,
                    tmp.data('type'),
                    tmp.data('creation-time'),
                    tmp.data('update-time')
                );
            }
        );
    }

    function decryptContents() {
        if (isContentsEncrypted) {
            for (var divid in contents) {
                if (contents.hasOwnProperty(divid)) {
                    var content = contents[divid];
                    if (!content.decrypt()) {
                        return false;
                    }
                }
            }
        }
        isContentsEncrypted = false;
        return true;
    }

    /********************************************************************/

    $(document).ready(function () {
            console.log("Populating page");
            //var hash = window.location.hash;
            //if (hash !== '') {
            //    anchorLoadChange();
            //}
            $('body').append('<div class="container" style="z-index: 10000;">' +
            '    <a data-toggle="collapse" href="#kms-collapse">' +
            '        <small>+</small>' +
            '    </a>' +
            '    <div class="row">' +
            '        <div id="kms-collapse" class="collapse">' +
            '            <div class="form-group col-md-2">' +
            '                <input type="password" id="kms-key1" class="pull-right form-control input-sm" style="padding: 1em;"' +
            '                       placeholder="Key for encryption ...">' +
            '            </div>' +
            '            <div class="form-group col-md-2">' +
            '                <input type="password" id="kms-key2" class="pull-right form-control input-sm" style="padding: 1em;"' +
            '                       placeholder="Key for encryption ...">' +
            '            </div>' +
            '            <div class="form-group col-md-2">' +
            '                <input type="password" id="kms-password" class="pull-right form-control input-sm"' +
            '                       style="padding: 1em;"' +
            '                       placeholder="Password for editing ...">' +
            '            </div>' +
            '            <div class="form-group col-md-2">' +
            '                <input id="kms-file" class="pull-right form-control input-sm"' +
            '                       style="padding: 1em;"' +
            '                       placeholder="File name ...">' +
            '            </div>' +
            '            <div id="kms-drop-area-div" class="col-md-2">' +
            '                Drag and Drop Files Here<br/>' +
            '            </div>' +
            '            <div class="col-md-2">' +
            '                <span onclick="KMS.refreshPage()"' +
            '                      class="glyphicon glyphicon-refresh"  title="Refresh page"></span>' +
            '                <span onclick="KMS.savePage()"' +
            '                      class="glyphicon glyphicon-floppy-disk" title="Save"></span>' +
            '                <span onclick="KMS.download()"' +
            '                      class="glyphicon glyphicon-download-alt"  title="Download"></span>' +
            '                <span onclick="KMS.newPage()"' +
            '                      class="glyphicon glyphicon-file"  title="Create new using file name"></span>' +
            '                <span onclick="KMS.savePageAs()"' +
            '                      class="glyphicon glyphicon-cloud-upload"  title="Save as file name"></span>' +
            '                <span onclick="KMS.listContents()"' +
            '                      class="glyphicon glyphicon-list"  title="List contents for removal.  Must save after removal."></span>' +
            '                <span onclick="KMS.incCount()"' +
            '                      class="glyphicon glyphicon-flash"  title="Increment"></span>' +
            '' +
            '            </div>' +
            '        </div>' +
            '    </div>' +
            '</div>');

            initUploader();
            collectContents();
            decryptContents();
            refreshContent($(KMSMAIN));

            $(window).bind('hashchange', anchorLoadChange).trigger('hashchange');
            $(window).bind('beforeunload', function (e) {
                if (modified) {
                    return "Page modified.  Do you want to leave without saving the page?";
                }
            });

        }
    );


    /********************************************************************/
    /***************************  API  **********************************/
    /********************************************************************/
    module.Content = Content;
    module.setPlugin = setPlugin;
    module.getPlugin = getPlugin;
    module.URL = "https://apps.eecs.berkeley.edu/~ksen/readwrite.php";

}(KMS));
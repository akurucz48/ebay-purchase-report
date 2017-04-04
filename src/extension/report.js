// Make sure it works for both, Mozilla and Chrome|Opera
var agent = "undefined" !== typeof chrome ? chrome : browser;

/**
 * Create a new DOM element
 * 
 * @param {Element}
 *            parent - The parent DOM element for the new element
 * @param {string}
 *            tag - The tag element to create
 * @param {string=}
 *            text - Optional. The inner text for the new element.
 * @param {Object=}
 *            attrs - Optional. The new element attributes.
 * @returns {Element} Returns the new created element
 */
function appendElement(parent, tag, text, attrs) {
    if ('undefined' !== typeof tag && '' != String(tag)) {
        var e = document.createElement(tag);
    } else {
        e = parent;
    }

    if ('undefined' !== typeof text && text) {
        e.appendChild(document.createTextNode(text));
    }
    if ('undefined' !== typeof attrs && attrs) {
        var i;
        for (i in attrs) {
            if (attrs.hasOwnProperty(i)) {
                e.setAttribute(i, attrs[i]);
            }
        }
    }

    if (e !== parent) {
        parent.appendChild(e);
    }

    return e;
}

/**
 * An asynchron helper class that provides info about the running platform
 * 
 * @param {callback}
 *            callback - A callback to be notified when the platform information is available
 */
function Platform(callback) {
    var response = {};
    var callbacks = [];

    function notifyCallbacks() {
        if (response.hasOwnProperty('browser') && response.hasOwnProperty('info')) {
            callbacks.forEach(function(callback) {
                callback(response.info, response.browser);
            });
        }
    }

    callbacks.push(callback);
    notifyCallbacks();

    if (agent.runtime.hasOwnProperty('getBrowserInfo')) {
        agent.runtime.getBrowserInfo(function(browser) {
            response.browser = browser;
            notifyCallbacks();

        });
    }
    if (agent.runtime.hasOwnProperty('getPlatformInfo')) {
        agent.runtime.getPlatformInfo(function(platform) {
            response.info = platform;
            notifyCallbacks();
        });
    }
}

/**
 * A class that generates the HTML report
 * 
 * @param {Object}
 *            params - The object containing the report settings and data
 */
function Report(params) {
    params = params || {};

    // set default values when a certain param not defined
    var sortby = params.sortby || "";
    var reverseorder = params.reverseorder || false;
    var orders = params.orders || [];
    var filters = params.filters || [];
    var highlight = params.highlight || {};
    highlight.delayedShipment = highlight.delayedShipment || {
        days : 5,
        title : "Shipped after 5 days",
        "class" : "delayed-shipment"

    };
    highlight.notDelivered = highlight.notDelivered || {
        days : 40,
        title : "Not delivered within 40 days",
        "class" : "not-delivered"
    };
    highlight.itemNotReceived = highlight.itemNotReceived || {
        title : "Not received yet",
        "class" : "not-received "
    };
    highlight.itemReceived = highlight.itemReceived || {
        title : "Item received",
        "class" : "received"
    };

    var manifest = agent.runtime.getManifest();
    var platform = {};

    // prepare export data
    var reportExport = document.body.querySelector('.export-report');
    if (null !== reportExport) {
        var i, mime = {
            csv : 'text/csv',
            json : 'application/json',
            xml : 'application/xml'
        };

        appendElement(reportExport, 'label', 'Export as:');

        for (i in mime) {
            if (mime.hasOwnProperty(i)) {
                var blob = new Blob([ getExportData(i) ], {
                    type : mime[i]
                });
                appendElement(reportExport, 'a', i.toUpperCase(), {
                    "href" : URL.createObjectURL(blob),
                    "downlod" : 'data.' + i,
                    "class" : i
                });
            }
        }
    }

    /**
     * Converts the given order array to its XML string representation
     * 
     * @params {Array} array - An array containing the order data
     * @returns {string}
     */
    function orders2Xml(array) {
        array = array || [];

        var xmlEscape = function(string) {
            string = String(string);

            var escapeChars = {
                quot : '"',
                apos : "'",
                lt : '<',
                gt : '>',
                amp : '&'
            }, i;

            for (i in escapeChars) {
                if (escapeChars.hasOwnProperty(i)) {
                    string = string.replace(escapeChars[i], '&' + i + ';');
                }
            }

            return string;
        };

        var xmlSchema = '<?xml version="1.0" encoding="UTF-8" ?>';
        var now = new Date();
        var signature = '<generator type="WebExtension" datetime="' + now.toUTCString() + '" alias="' + manifest.short_name
                + '" name="' + xmlEscape(manifest.name) + '" version="' + xmlEscape(manifest.version) + '" author="'
                + xmlEscape(manifest.author) + '" homepage="' + manifest.homepage_url + '" description="'
                + manifest.description + '"></generator>';

        // make sure the array is ordered by OrderId,itemIndex
        array = array.sort(function(a, b) {
            if (a.orderId < b.orderId) {
                return a;
            } else if (a.orderId == b.orderId) {
                if (a.itemIndex < b.itemIndex) {
                    return a;
                }
            }
            return b;
        });

        var rows = [], lastOrderId = null;
        array.forEach(function(order, index) {
            var orderCols = [ 'orderId', 'purchaseDate', 'seller' ];
            // close `order` tag on orderId change
            if (lastOrderId !== order.orderId) {
                rows.push((null !== lastOrderId ? '</items></order>' : '') + '<order id="' + xmlEscape(order.orderId)
                        + '" purchaseDate="' + xmlEscape(order.purchaseDate) + '" seller="' + xmlEscape(order.seller.name)
                        + '" sellerUrl="' + xmlEscape(order.seller.url) + '"><items>');
                lastOrderId = order.orderId;
            }

            var i, attrs = [];
            for (i in order) {
                if (orderCols.indexOf(i) < 0 && order.hasOwnProperty(i)) {
                    attrs.push(i + '="' + xmlEscape(order[i]) + '"');
                }
            }
            rows.push('<item ' + attrs.join(' ') + '></item>');
        });

        if (null !== lastOrderId) {
            rows.push('</items></order>');
        }

        return xmlSchema + "<orders>" + signature + rows.join("") + "</orders>";
    }

    /**
     * Get the data exported in the given format
     * 
     * @params {string} format - The export format (json|csv|xml)
     * @return {string} - Returns the exported data in the given format
     */
    function getExportData(format) {
        var result = '';
        switch (format) {
        case 'json':
            result = JSON.stringify(orders);
            break;
        case 'xml':
            result = orders2Xml(orders);
            break;
        case 'csv':
            orders.forEach(function(order, index) {
                // file header
                if ('' == result) {
                    result += Object.keys(order).join("\t") + "\n";
                }

                // file content
                var line = [], i;
                for (i in order) {
                    if (order.hasOwnProperty(i)) {
                        line.push('seller' == i ? order[i]["name"] : order[i]);
                    }
                }
                result += line.join("\t") + "\n";
            });
            break;
        }

        return result;
    }

    /**
     * Get the columns of the report
     * 
     * @return {Object} - Returns the columns definition
     */
    function getColumns() {
        var cols = {
            index : {
                label : "#"
            },
            seller : {
                href : {
                    url : "url",
                    text : "name"
                },
                label : "Seller",
                sort : true
            },
            purchaseDate : {
                label : "Purchase date",
                sort : true
            },
            price : {
                label : "Item price",
                sort : true
            },
            quantity : {
                label : "Quantity",
                sort : true
            },
            shipStatus : {
                label : "Shipping status",
                sort : true
            },
            deliveryDate : {
                label : "Estimated delivery",
                sort : true
            },
            specs : {
                label : "Item description",
            }
        };

        return cols;
    }

    /**
     * Get the report column count
     * 
     * @return int
     */
    function getColumnsCount() {
        var cols = getColumns();

        return Object.keys(cols).length;
    }

    /**
     * Add a group|header report row
     */
    function addWideRow(parent, attrs) {
        var row = appendElement(parent, 'tr', null, attrs);
        row.addEventListener('mouseover', updateThumbnail);

        return row;
    }

    /**
     * Creates the report header
     * 
     * @params {Element} parent - The parent element where the header will be appended
     */
    function addHeader(parent) {
        var sortByColumn = function(event) {
            var name = event.target.getAttribute("name");
            agent.tabs.getCurrent(function(tab) {
                agent.runtime.sendMessage({
                    tabId : tab.id,
                    sortBy : name,
                    reverseorder : !reverseorder
                });
            });
        };

        var cols = getColumns();

        var row = addWideRow(parent, {
            "class" : "wide"
        });

        var i, td, attrs, html;
        for (i in cols) {
            if (cols.hasOwnProperty(i)) {
                td = appendElement(row, 'th', cols[i].label);
                if (cols[i].hasOwnProperty('sort') && true === cols[i].sort) {
                    var sort_order = false === reverseorder && i == sortby ? "desc" : "asc";
                    var sortIcon = appendElement(td, 'div', null, {
                        "class" : "sort-icon sort-" + sort_order,
                        "name" : i,
                        "title" : "Sort " + sort_order
                    });
                    sortIcon.addEventListener("click", sortByColumn);
                }
            }
        }
    }

    /**
     * Generates the report footer
     */
    function addReportFooter() {
        var footer = {
            addon : document.querySelector('.report-footer .addon-info'),
            icon : document.querySelector('.report-footer .addon-icon'),
            selector : document.querySelector('.report-footer .platform-info')
        };

        if (null !== footer.selector) {
            Platform(function(info, browser) {
                var text = 'running on ' + agent.vendor + ' ' + agent.name + ' v' + agent.version + ' / '
                        + info.os.charAt(0).toUpperCase() + info.os.slice(1) + ' ' + info.arch;
                appendElement(footer.selector, 'span', text);
            });
        }

        if (footer.addon) {
            if (footer.icon) {
                appendElement(footer.icon, 'img', null, {
                    src : manifest.icons[32]
                });
            }

            var text = manifest.short_name + ' v' + manifest.version;
            appendElement(footer.addon, 'a', text, {
                href : manifest.homepage_url
            });
        }
    }

    /**
     * Add a new group subtotal to the given DOM parent element
     * 
     * @param {Object}
     *            parent - The parent DOM element where to append the group footer
     * @param {string}
     *            label - The group's total prefix label
     * @param {number}
     *            value - The group's total value
     * @param {string}
     *            currency - The group's currency for the value
     * @param {int}
     *            count - The group's total number of items
     * @param {int}
     *            shipped - The group's total number of shipped items
     * @param {Object=}
     *            attrs - Optional. An object containing the custom atrributes for the group footer element.
     */
    function addGrpFooter(parent, label, value, currency, count, shipped, attrs) {
        attrs = attrs || {};
        attrs["class"] = (attrs.hasOwnProperty("class") ? attrs["class"] : "") + " group-footer";
        var row = addWideRow(parent, attrs);

        appendElement(row, 'td', label, {
            "colspan" : 2
        });

        var text = Math.round(value, 2) + ' ' + currency + ', ' + shipped + ' shipped, ' + (count - shipped)
                + ' not-shipped (' + count + ' items, ~ ';
        text += Math.round(value / count, 2);
        text += ' ' + currency + '/item)';

        appendElement(row, 'td', text, {
            "colspan" : getColumnsCount() - 2
        });
    }

    /**
     * Calculates what attributes the item should have based on its not-shipped, not-delivered,etc info
     * 
     * @param {Object}
     *            item - An object containing the item fields.
     * @return {Object} Return an object containing the item's CSS attributes
     */
    function getItemHighlightedAttrs(item) {
        var dateDiff = function(date1, date2) {
            var diff = date1 - date2;// in microseconds
            return diff / 86400000;
        };
        var purchaseDate = Date.parse(item.purchaseDate);
        var result = false;

        if (NaN !== purchaseDate) {
            var daysFromPurchase = dateDiff(Date.now(), purchaseDate);

            var shippingDate = Date.parse(item.shipStatus);
            var shippedAfterDays = NaN === shippingDate ? daysFromPurchase : dateDiff(shippingDate - purchaseDate);
            var deliveryDate = Date.parse(item.deliveryDate.replace(/.*-\s*/g, ''));
            deliveryDate = NaN === deliveryDate ? Date.now() : deliveryDate;

            if (!item.received) {
                // item not delivered after 40 days
                if (dateDiff(deliveryDate, purchaseDate) > highlight.notDelivered.days) {
                    result = highlight.notDelivered;
                }

                // not yet shipped after 5 days
                if (shippedAfterDays > highlight.delayedShipment.days) {
                    result = highlight.delayedShipment;
                }

                // item not received on due date
                if (NaN !== deliveryDate && dateDiff(Date.now(), deliveryDate) > 0) {
                    result = highlight.itemNotReceived;
                }
            } else {
                // item received
                result = highlight.itemReceived;
            }
        }

        return result;
    }

    /**
     * Add a legend item with the given attributes
     * 
     * @param {Object}
     *            attrs - The attributes of the legend item
     */
    function updateLegend(attrs) {
        var reportLegend = document.body.querySelector('.report-legend');

        if (null === reportLegend || null !== reportLegend.querySelector("." + attrs['class'])) {
            return;
        }

        // append the legend entry
        appendElement(reportLegend, 'li', attrs['title'], attrs);
    }

    /**
     * Add the report filters in the report header
     */
    function updateFilters() {
        var reportFilter = document.body.querySelector('.report-filters');

        if (null === reportFilter) {
            return;
        }

        filters.forEach(function(filter, index) {
            var entry = appendElement(reportFilter, 'tr');
            appendElement(entry, 'td', filter.label + ' :');
            appendElement(entry, 'td', filter.content);
        });
    }

    /**
     * Add the report title
     */
    function updateTitle() {
        var reportTitle = document.body.querySelector('h2.report-title');
        if (null === reportTitle) {
            return;
        }

        appendElement(reportTitle, null, manifest.name);
    }

    /**
     * Update the target element thumbnail image on mouse-over
     */
    function updateThumbnail(event) {
        var src = event.currentTarget.getAttribute("data-thumbnail");
        if (null !== src && src.length) {
            document.getElementById('thumbnail').setAttribute("src", src);
        } else {
            document.getElementById('thumbnail').removeAttribute("src");
        }
    }

    /**
     * Adds a new row for the given fields by padding their values with spaces if not having a given minimum length.
     * 
     * @param {Object}
     *            parent - The parent DOM element where to append the row
     * @param {Object}
     *            fields - An object containing the field's key name and their corresponding values
     * @param {Object=}
     *            dataset - Optional. A dataset object to add to the row
     */
    function addRow(parent, fields, dataset) {
        dataset = dataset || {};

        var cols = getColumns();

        var onRowClick = function(event) {
            agent.runtime.sendMessage({
                showItem : {
                    orderId : event.target.parentElement.dataset.orderid,
                    index : event.target.parentElement.dataset.index
                }
            });
        };

        var f, a = [], v, attr;
        var attrs = getItemHighlightedAttrs(fields);

        if (false !== attrs) {
            updateLegend(attrs);
        }

        var row = appendElement(parent, 'tr', false, attrs);
        row.addEventListener('mouseover', updateThumbnail);

        for (f in dataset) {
            if (dataset.hasOwnProperty(f)) {
                row.dataset[f] = dataset[f];
            }
        }

        if (dataset.hasOwnProperty('orderid') && dataset.hasOwnProperty('index')) {
            row.addEventListener("click", onRowClick);
        }

        for (f in fields) {
            if (fields.hasOwnProperty(f) && cols.hasOwnProperty(f)) {
                attr = null;
                if (sortby == f) {
                    attr = {
                        "class" : "sort-column"
                    };
                }

                // in case of a href column
                if (cols[f].hasOwnProperty('href')) {
                    var td = appendElement(row, 'td', null, attr);
                    var hrefCol = cols[f].href;
                    appendElement(td, 'a', fields[f][hrefCol.text], {
                        "href" : fields[f][hrefCol.url],
                        "target" : "_blank"
                    });
                } else {
                    // a normal text column
                    appendElement(row, 'td', fields[f], attr);
                }
            }
        }
    }

    /**
     * Generates the HTML output for the orders items
     * 
     * @param {Element}
     *            parent - The parent element that encloses the HTML output
     */
    this.printData = function(parent) {
        var i;
        var e;
        var c;
        var v;
        var n;
        var g = 0;
        var s = 0;
        var ts = 0;
        var j = 0;
        var t = 0;
        var gt = 0;
        var currency;
        var prevDate = '';
        var prevCurrency = '';
        var prevSeller = '';
        var currencies = [];

        var cols = getColumns();
        var sortByDate = [ 'purchaseDate', 'shipStatus', 'deliveryDate' ].indexOf(sortby) >= 0;

        // clean-up the existent content, if any
        while (parent.hasChildNodes()) {
            parent.removeChild(parent.lastChild);
        }

        updateTitle();

        updateFilters();

        addHeader(parent);

        for (i = 0; i < orders.length; i += 1) {
            e = orders[i];
            c = e.price.replace(/.*?([a-zA-Z]+)/g, '$1');
            n = e.seller.name;

            var newGroup = ('' == sortby || sortByDate) && (prevDate.length && e.purchaseDate != prevDate);
            newGroup = newGroup || (prevCurrency.length && c != prevCurrency);
            newGroup = newGroup || ('seller' == sortby && prevSeller.length && n != prevSeller);

            // print the group footer
            if (newGroup) {
                addGrpFooter(parent, 'SUBTOTAL', t, currency, j, s);
                g += 1;
                j = 0;
                t = 0;
                s = 0;
                prevDate = e.purchaseDate;
                prevCurrency = c;
                prevSeller = n;
            }

            if (/\d+/g.test(e.shipStatus)) {
                s += 1;
                ts += 1;
            }

            currency = c;
            v = parseFloat(e.price.replace(/.*?([\d\.]+).*/g, '$1'));
            t += v;
            gt += v;

            var itemData = {
                index : i + 1,
                seller : e.seller,
                purchaseDate : e.purchaseDate,
                price : e.price,
                quantity : e.quantity,
                shipStatus : e.shipStatus,
                deliveryDate : e.deliveryDate,
                specs : e.specs,
                received : !e.feedbackNotLeft
            };

            // print the item's row
            addRow(parent, itemData, {
                orderid : e.orderId,
                index : e.itemIndex,
                thumbnail : e.thumbnail
            });

            j += 1;
            prevDate = e.purchaseDate;
            prevSeller = e.seller.name;
            prevCurrency = currency;
            if (currencies.indexOf(prevCurrency) < 0) {
                currencies.push(prevCurrency);
            }
        }

        // print the last group footer
        if (g) {
            addGrpFooter(parent, 'SUBTOTAL', t, currency, j, s);
        }

        // print the grand total
        if (1 == currencies.length) {
            addGrpFooter(parent, 'GRAND TOTAL', gt, currencies[0], orders.length, ts, {
                "class" : "wide"
            });
        }

        addReportFooter();

        parent.addEventListener("mouseenter", function(event) {
            var el = document.getElementById('thumbnail');
            el.className = el.className.replace(/\bhidden/, '')
        });
        parent.addEventListener("mouseleave", function(event) {
            var el = document.getElementById('thumbnail');
            el.className += " hidden";
        });
    };
}

/**
 * Popup a error message which fades-out at onClick or automatically after 5sec.
 * 
 * @param {string}
 *            message - The message error to show
 * @returns
 */
function showError(message) {
    var wrapper = appendElement(document.body, 'div', null, {
        "class" : "error-message-wrapper"
    });
    var inner = appendElement(wrapper, 'div', null, {
        "class" : "error-message-inner"
    });
    var message = appendElement(inner, 'div', message, {
        "class" : "error-message"
    });

    var fadeOut = function() {
        wrapper.setAttribute("class", wrapper.getAttribute("class") + " fade-out");
        // remove the wrapper after 0.5s (fade-out duration)
        setTimeout(function() {
            if (wrapper.parentNode) {
                wrapper.parentNode.removeChild(wrapper);
            }
        }, 500);
    };

    wrapper.addEventListener("click", fadeOut);

    // fade out automatically after 5s
    setTimeout(fadeOut, 5000);
}

/**
 * Generate the report
 * 
 * @param {Object}
 *            data - The object that contains the report's data
 */
function print(data) {
    var reportDate = document.querySelector('.report-date-wrapper');
    var table = document.querySelector('.report');

    if (null !== reportDate) {
        var today = new Date();
        appendElement(reportDate, 'span', "(generated at " + today.toUTCString() + ")");
    }

    if (null !== table) {
        var report = new Report(data);
        report.printData(table);
    } else {
        console.error('Parent table with class ".report" not found');
    }
}
/**
 * Listen for messages received from the background script
 */
agent.runtime.onMessage.addListener(function(request, sender, sendRespose) {
    if (request.hasOwnProperty('reportData')) {
        print(request.reportData);

        // save data to session cache
        sessionStorage.setItem('reportData', JSON.stringify(request.reportData));
    }
    if (request.hasOwnProperty('eBayPageNotFound')) {
        showError(request.eBayPageNotFound);
    }
});

// on page refresh load data from session cache
document.addEventListener('DOMContentLoaded', function() {
    if ('undefined' !== typeof Storage) {
        var reportData = sessionStorage.getItem('reportData');
        try {
            reportData = JSON.parse(reportData);
            if (null !== reportData) {
                print(reportData);
            }
        } catch (e) {
            console.log(e);
        }
    }
});
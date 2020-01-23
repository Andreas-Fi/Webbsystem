/*
Uppgift:
-2 användargränssnitt, 1 kund 1 personal    ✓
-Söka produkter med olika sökkriterier      ✓
-Få fram info om produkten samt bild        ✓
-Shoppingvagn                               ✓
-Avsluta beställningen -> Sparas i Db       ✓
-Avsluta beställningen utan att spara       ✓
-Anteckna beställningar på personal sidan   ✓ 

-Extra finesser
    -HTTPS / SSL - [1]                      ✓

TCP portar: http: 8080, https: 8443

[1]
Certificatet är gjort med openSSL så CA:n (certificate authorithy) är ogiltig
*/

let express = require('express');
let path = require('path');
let exhbs = require('express-handlebars');
let bodyParser = require('body-parser');
var session = require('express-session');
var sqlite3 = require('sqlite3').verbose();
var fs = require('fs');
let phones = require('./phones');
let app = express();
var http = require('http');
var https = require('https');

//Reads the ssl certificate
var cert = fs.readFileSync(__dirname + '/sslcert/cert.cer');
var key = cert;
var credentials = { key: key, cert: cert, passphrase: "" };

//Creates or connects to a database
let db = new sqlite3.Database('./db/inlamning.db', (err) => {
    if (err) {
        throw err.message;
    }
});
//Creates a table if it doesnt exist
db.run('CREATE TABLE IF NOT EXISTS orders(\
    orderId INTEGER PRIMARY KEY AUTOINCREMENT,\
    orderDelivered INTEGER,\
    customerName TEXT NOT NULL,\
    customerEmail TEXT NOT NULL,\
    customerCreditcardNumber INTEGER NOT NULL,\
    phoneBrand TEXT NOT NULL,\
    phoneName TEXT NOT NULL,\
    phonePrice INTEGER NOT NULL)', function (err) {
    if (err) {
        throw err.message;
    }
    console.log("Database created/exists");
    db.close();
});

app.engine('handlebars', exhbs({ defaultLayout: 'main' }));
app.set('view engine', 'handlebars');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

//Static paths
app.use(express.static(path.join(__dirname, 'views')));
app.use(express.static(path.join(__dirname, 'views/images')));
app.use(express.static(path.join(__dirname, 'views/style')));

//Global variable that contains the cart for each user
var Carts = [];

//Creates a session cookie
var sess = {
    secret: 'ooooCookies',
    cookie: {},
    resave: false,
    saveUninitialized: true
};
app.set('trust proxy', 1);
app.use(session(sess));
app.use(function (req, res, next) {
    res.locals.session = req.session;
    next();
});

//Get localhost:8080 || localhost:8443
//Main page
app.get('/', function (req, res) {
    let i = 0;
    for (; i < Carts.length; i++) {
        if (Carts[i].session == req.sessionID) {
            break;
        }
    }
    if (i == Carts.length) {
        Carts.push({ session: req.sessionID, cart: [] });
    }
    res.render('index', { phones: phones, title: 'Phones for sale:', itemsInCart: Carts[i].cart.length });
});

//Get localhost:8080 || localhost:8443/cart
//Page where the user can view the items in his/her cart
app.get('/cart', function (req, res) {
    let i = 0;
    for (; i < Carts.length; i++) {
        if (Carts[i].session == req.sessionID) {
            break;
        }
    }
    let price = 0;
    for (let j = 0; j < Carts[i].cart.length; j++) {
        price += Number(Carts[i].cart[j].price);
        
    }

    res.render('cart', { items: Carts[i].cart,totalPrice:price });
});

//Get localhost:8080 || localhost:8443/superhiddenadministrationpage
//Administration page
app.get('/superhiddenadministrationpage', function (req, res) {
    let db = new sqlite3.Database('./db/inlamning.db', sqlite3.OPEN_READONLY, function (err) {
        if (err) {
            throw err.message;
        }
        let undeliveredItems = [];
        let deliveredItems = [];
        db.each('SELECT customerName,phoneName,phoneBrand,orderId FROM orders WHERE orderDelivered = 0', function (err, row) {
            if (err) {
                console.log(err.message);
            }
            undeliveredItems.push({ customerName: row.customerName, phoneName: row.phoneName, phoneBrand: row.phoneBrand, id: row.orderId });
        }, function (err, count) {
            if (err) {
                console.log(err.message);
            }
            db.each('SELECT customerName,phoneName,phoneBrand,orderId FROM orders WHERE orderDelivered = 1', function (err, row) {
                if (err) {
                    console.log(err.message);
                }
                deliveredItems.push({ customerName: row.customerName, phoneName: row.phoneName, phoneBrand: row.phoneBrand, id: row.orderId });
            }, function (err, count) {
                if (err) {
                    console.log(err.message);
                }
                res.render('administration', { undeliveredItems: undeliveredItems, deliveredItems: deliveredItems });
            });
        });
        db.close();
    });
});

//Post function for the "Add item to cart" button at page /
app.post('/addToCart', function (req, res) {
    let i = 0;
    for (; i < Carts.length; i++) {
        if (Carts[i].session == req.sessionID) {
            break;
        }
    }
    Carts[i].cart.push({ name: req.body.name, brand: req.body.brand, price: req.body.price })
    res.render('index', { phones: phones, title: 'Phones for sale:', itemsInCart: Carts[i].cart.length });
});

//Post function for the filterbox/button at page /
app.post('/filterIndex', function (req, res) {
    if (req.body.filter == "") {
        res.redirect('/');
    }
    else {
        let filterOption = req.body.filter; //.replace(/\s/g, ''); //Removes whitespaces 
        filterOption = filterOption.split('&');

        for (let i = 0; i < filterOption.length; i++) {
            let temp = filterOption[i].split('=');
            if (filterOption[i] != temp[0]) {
                filterOption.splice(i, 1, temp[0]);
                filterOption.splice(i + 1, 0, temp[1]);
            }
        }
        for (let i = 0; i < filterOption.length; i++) {
            filterOption[i] = filterOption[i].trim();
        }

        let i = 0;
        for (; i < Carts.length; i++) {
            if (Carts[i].session == req.sessionID) {
                break;
            }
        }
        if (i == Carts.length) {
            Carts.push({ session: req.sessionID, cart: [] });
        }
        let filteredPhones = [];

        filterOption[0] = filterOption[0].toLocaleLowerCase();
        if (filterOption[0] == 'model') {
            filterOption[0] = 'name';
        }

        phones.forEach(element => {
            if (element[filterOption[0]] == filterOption[1] && filterOption.length == 2) {
                filteredPhones.push(element);
            }
            if (element[filterOption[0]] == filterOption[1] && element[filterOption[2]] == filterOption[3] && filterOption.length == 4) {
                filteredPhones.push(element);
            }
        });

        res.render('index', { phones: filteredPhones, title: 'Phones for sale:', itemsInCart: Carts[i].cart.length, filter: req.body.filter });
    }
});

//Post function for the "Remove item from cart" button at page /cart
app.post('/removeFromCart', function (req, res) {
    let i = 0;
    for (; i < Carts.length; i++) {
        if (Carts[i].session == req.sessionID) {
            break;
        }
    }
    for (let ii = 0; ii < Carts[i].cart.length; ii++) {
        if (req.body.name == Carts[i].cart[ii].name &&
            req.body.brand == Carts[i].cart[ii].brand &&
            req.body.price == Carts[i].cart[ii].price) {
            Carts[i].cart.splice(ii, 1);
            break;
        }
    }
    res.render('cart', { items: Carts[i].cart });
});

//Post function for the "Confirm order" button at page /cart
app.post('/confirm', function (req, res) {
    let i = 0;
    for (; i < Carts.length; i++) {
        if (Carts[i].session == req.sessionID) {
            break;
        }
    }
    db = new sqlite3.Database('./db/inlamning.db');
    Carts[i].cart.forEach(element => {
        db.run(`INSERT INTO orders(orderDelivered, customerName, customerEmail, customerCreditcardNumber, phoneBrand, phoneName, phonePrice)\
         VALUES(?,?,?,?,?,?,?)`, [0, req.body.name, req.body.email, req.body.creditcard,
            element.name, element.brand, element.price], function (err) {
                if (err) {
                    return console.log(err.message);
                }
            });
    });
    db.close();
    
    Carts[i].cart = [];
    res.render('orderSuccess');
});

//Post function for the "Order shipped" button at page /superhiddenadministrationpage
app.post('/hiddenUpdateDeliveryStatus', function (req, res) {
    db = new sqlite3.Database('./db/inlamning.db');
    //Updates the selected order to delivered
    db.run('UPDATE orders SET orderDelivered = 1 WHERE orderId = ?', [req.body.id], function (err) {
        if (err) {
            throw err.message;
        }
        //Refreshes the page
        res.redirect('/superhiddenadministrationpage');
    })
});

//Creates servers
var httpServer = http.createServer(app);
var httpsServer = https.createServer(credentials, app);
//8080 - Alternative port for HTTP.
httpServer.listen(8080, "0.0.0.0", function (err) {
    if (err) {
        throw err.message;
    }
    console.log('HTTP: Listening on port 8080');
});
//Common alternative for 443
httpsServer.listen(8443, "0.0.0.0", function (err) {
    if (err) {
        throw err.message;
    }
    console.log('HTTPS: Listening on port 8443');
});
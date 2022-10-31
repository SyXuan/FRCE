const express = require('express');
const router = express.Router();
const bodyParser = require("body-parser");
const _ = require('lodash');

const PORT = 3210;

const ERROR_CODE = {
    CANNOT_FIND_PAYER: 'Can not find payer',
    NOT_ENOUGH_POINTS: 'Not enough points',
};

let database = {
    // { id: ID!, payer: String, point: Int, available: Int, timestamp: String }
    transactions: [],

    // { id: ID!, name: String, points: Int }
    payers: [{
            id: 1,
            name: 'DANNON',
            points: 0,
        },
        {
            id: 2,
            name: 'UNILEVER',
            points: 0,
        },
        {
            id: 3,
            name: 'MILLER COORS',
            points: 0,
        },
    ],
}

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use("/", router);

router.get('/', (req, res) => {
    res.send('Hello');
});

router.get('/transactions', (req, res) => {
    res.send(database.transactions);
})

router.get('/balance', (req, res) => {
    response = {};
    for (let i = 0; i < database.payers.length; i++) {
        response[database.payers[i].name] = database.payers[i].points;
    }
    res.status(200).send(response);
});

// { "payer": "DANNON", "points": 300, "timestamp": "2022-10-31T10:00:00Z" }
// { "payer": "UNILEVER", "points": 200, "timestamp": "2022-10-31T11:00:00Z" }
// { "payer": "DANNON", "points": -200, "timestamp": "2022-10-31T15:00:00Z" }
// { "payer": "MILLER COORS", "points": 10000, "timestamp": "2022-11-01T14:00:00Z" }
// { "payer": "DANNON", "points": 1000, "timestamp": "2022-11-02T14:00:00Z" }
router.post('/transaction', (req, res) => {
    const data = req.body;

    // Check isNil and types
    if (_.isString(data.payer) && _.isInteger(data.points) && _.isString(data.timestamp)) {
        try {
            // Insert to Database
            const transId = database.transactions.length + 1;
            database.transactions.push({
                id: transId,
                payer: data.payer,
                points: data.points,
                available: data.points,
                timestamp: new Date(data.timestamp),
            });
            console.log('[POST][transaction] Insert %j', database.transactions[database.transactions.length - 1]);

            if (data.points < 0) {
                console.log('[POST][transaction] The points are negative');
                let points = -data.points;
                for (let i = 0; i < database.transactions.length; i++) {
                    if (database.transactions[i].payer == data.payer && database.transactions[i].available > 0 && points > 0) {
                        if (database.transactions[i].available > points) {
                            database.transactions[i].available -= points;
                            points = 0;
                            console.log('[POST][transaction] %j', database.transactions[i]);
                        } else {
                            points -= database.transactions[i].available;
                            database.transactions[i].available = 0;
                            console.log('[POST][transaction] %j', database.transactions[i]);
                        }
                    }
                }
            }

            // Update payer data
            let findPayer = false;
            for (let i = 0; i < database.payers.length; i++) {
                if (database.payers[i].name === data.payer) {
                    findPayer = true;
                    database.payers[i].points += data.points;
                    console.log('[POST][transaction] Payer %s, points: %d', data.payer, database.payers[i].points);
                    break;
                }
            }
            if (!findPayer) {
                throw ERROR_CODE.CANNOT_FIND_PAYER;
            }

            res.status(200).send('success');
            // res.status(200).send(database.transactions);
        } catch (e) {
            console.log('[POST][transaction] Error');
            console.log(e)
            if (e === ERROR_CODE.CANNOT_FIND_PAYER) {
                res.status(422).send(e);
            } else {
                res.status(500).send(e);
            }
        }
    } else {
        console.log('[POST][transaction] data error: %j', data);
        res.status(400).send('Data error');
    }
});

// { "points": 5000 }
router.post('/spend', (req, res) => {
    const data = req.body;

    // Check isNil and types
    if (_.isInteger(data.points)) {
        try {
            let points = data.points;

            // Find database
            let trans = database.transactions;
            trans.sort((a, b) => (a.timestamp > b.timestamp) ? 1 : -1);
            console.log(trans);
            let ids = [];
            for (let i = 0; i < trans.length; i++) {
                if (trans[i].available > 0 && points > 0) {
                    points -= trans[i].available;
                    ids.push(trans[i].id);
                }
            }
            if (points > 0) {
                throw ERROR_CODE.NOT_ENOUGH_POINTS;
            }
            console.log(ids);

            // Do spend
            points = data.points;
            let payers = {};
            for (let i = 0; i < ids.length; i++) {
                // Do database
                for (let j = 0; j < database.transactions.length; j++) {
                    if (database.transactions[j].id === ids[i]) {
                        const payer = database.transactions[j].payer;
                        if (points > database.transactions[j].available) {
                            if (payer in payers) {
                                payers[payer] -= database.transactions[j].available;
                            } else {
                                payers[payer] = -database.transactions[j].available;
                            }

                            console.log('[POST][spend] spend %i', database.transactions[j].available);
                            points -= database.transactions[j].available;

                            // Update payer data
                            for (let i = 0; i < database.payers.length; i++) {
                                if (database.payers[i].name === payer) {
                                    database.payers[i].points -= database.transactions[j].available;
                                    console.log('[POST][spend] Payer %s, points: %d', data.payer, database.payers[i].points);
                                    break;
                                }
                            }

                            database.transactions[j].available = 0;
                            console.log('[POST][spend] transaction: %j', database.transactions[j]);
                        } else {
                            if (payer in payers) {
                                payers[payer] -= points;
                            } else {
                                payers[payer] = -points;
                            }

                            console.log('[POST][spend] spend %i', points);
                            database.transactions[j].available -= points;

                            // Update payer data
                            for (let i = 0; i < database.payers.length; i++) {
                                if (database.payers[i].name === payer) {
                                    database.payers[i].points -= points;
                                    console.log('[POST][spend] Payer %s, points: %d', data.payer, database.payers[i].points);
                                    break;
                                }
                            }

                            points = 0;
                            console.log('[POST][spend] transaction: %j', database.transactions[j]);
                        }
                        break;
                    }
                    if (points == 0) {
                        break;
                    }
                }
            }

            res.status(200).send(payers);
        } catch (e) {
            console.log('[POST][spend] Error');
            console.log(e);
            if (e === ERROR_CODE.NOT_ENOUGH_POINTS) {
                res.status(404).send(e);
            } else {
                res.status(500).send(e);
            }
        }
    } else {
        console.log('[POST][spend] data error: %j', data);
        res.status(400).send('Data error');
    }
});

app.listen(PORT);
console.log('Express server running at http://localhost:' + PORT);
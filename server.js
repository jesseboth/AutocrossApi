const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { time } = require('cron');

const app = express();
const PORT = 8000;

const url = 'https://live.flr-scca.com/';

const classes = ["P", "S1", "S2", "T", "X", "$", "M", "N", "V"]

app.get('/timing-data/:class?', async (req, res) => {
    const classCode = req.params.class;
    try {
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);

        results = reset_results();
        let temp = {};

        driver = 0
        stop = false;
        $('tr.rowlow, tr.rowhigh').each((index, element) => {
            const columns = $(element).find('td');

            if(!stop && $(columns[0]).text().trim() == "Raw time"){
                stop = true;
            }
            else if (!stop && $(columns).length > 1){
                if (driver % 2 === 0) {  // Even index rows contain driver information
                    temp.times = []
                    position = $(columns[0]).text().trim().split("T")[0];
                    fullclass = $(columns[1]).text().trim();
                    classes.forEach(item => {
                        if(fullclass.startsWith(item)){
                            temp.classCode = item;
                        }
                    });
                    temp.carClass = $(columns[1]).text().trim();
                    temp.number = $(columns[2]).text().trim();
                    temp.driver = $(columns[3]).text().trim();
                    temp.pax = $(columns[4]).text().trim();
                    for(i = 5; i <= 8; i++){
                        if ($(columns[i]).text().trim() !== "") {

                            temp.times.push($(columns[i]).text().trim());
                        }
                    }

                    driver++;
                } 
                else {
                    temp.car = $(columns[3]).text().trim();
                    temp.offset = $(columns[4]).text().trim();
                    for(i = 5; i <= 8; i++){
                        if ($(columns[i]).text().trim() !== "") {
                            temp.times.push($(columns[i]).text().trim());
                        }
                    }

                    elem = {}
                    elem[position] = {...temp}
                    results[temp.classCode].push(elem)
                    temp = {};
                    driver = 0;
                }
            }
        });
        if (classCode != undefined) {
            res.json(results[classCode])
        }
        else {
            res.json(results)
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Error fetching data');
    }
});


app.get('/widget/:class?', async (req, res) => {
    const classCode = req.params.class;
    try {
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);

        results = reset_results(true);
        let temp = {};

        driver = 0
        stop = false;
        $('tr.rowlow, tr.rowhigh').each((index, element) => {
            const columns = $(element).find('td');

            if(!stop && $(columns[0]).text().trim() == "Raw time"){
                stop = true;
            }
            else if (!stop && $(columns).length > 1){
                if (driver % 2 === 0) {
                    temp.times = []
                    position = $(columns[0]).text().trim().split("T")[0];
                    temp.position = position;
                    fullclass = $(columns[1]).text().trim();
                    classes.forEach(item => {
                        if(fullclass.startsWith(item)){
                            temp.classCode = item;
                        }
                    });
                    temp.carClass = $(columns[1]).text().trim().slice(temp.classCode.length);
                    temp.number = $(columns[2]).text().trim();
                    temp.driver = $(columns[3]).text().trim();
                    temp.pax = $(columns[4]).text().trim();
                    for(i = 5; i <= 8; i++){
                        if ($(columns[i]).text().trim() !== "") {
                            temp.times.push($(columns[i]).text().trim());
                        }
                    }

                    driver++;
                } 
                else {
                    temp.car = $(columns[3]).text().trim();
                    temp.offset = $(columns[4]).text().trim();
                    for(i = 5; i <= 8; i++){
                        if ($(columns[i]).text().trim() !== "") {
                            temp.times.push($(columns[i]).text().trim());
                        }
                    }

                    driver = 0;
                    intPosition = parseInt(position)
                    if(intPosition <= 10){
                        results[temp.classCode][position] = {...temp}
                    }
                    else if(temp.driver == "Jesse Both") {
                        // put me in 10th if I am outisde top 10
                        results[temp.classCode]["10"] = {...temp}
                    }
                    temp = {}
                }
            }
        });
        if (classCode != undefined) {
            res.json(results[classCode])
        }
        else {
            res.json(results)
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Error fetching data');
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

function reset_results(widget=false){
    results = {}

    if(!widget){
        for(i = 0; i < classes.length; i++){
            results[classes[i]] = []
        }
    }
    else {
        for(i = 0; i < classes.length; i++){
            results[classes[i]] = {
                    "1": {"driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "1"},
                    "2": {"driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "2"},
                    "3": {"driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "3"},
                    "4": {"driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "4"},
                    "5": {"driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "5"},
                    "6": {"driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "6"},
                    "7": {"driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "7"},
                    "8": {"driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "8"},
                    "9": {"driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "9"},
                    "10":{"driver": " ", "car": " ", "carClass": " ", "number": " ", "pax": " ", "offset": " ", "times": [], "position": "10"}
                }
        }
    }
    
    return results
}

function toTitleCase(str) {
    return str.toLowerCase().split(' ').map(function(word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
}

function _timeCompare(time1, time2){

}

function timeCompare(time1, time2) {
    let t1 = time1.split("+");
    let t2 = time2.split("+");

    if(t1.length < t2.length){
        return time1
    }
    else if(t2.length > t1.length){
        return time2
    }


    // DSQ
    // OFF

    float_time1 = parseFloat(time1[0])
    float_time2 = parseFloat(time2[0])

    if (time1.length > 1) {
        float_time1 += (parseFloat(time1[1]) * 2)
    }
    if (time2.length > 1) {
        float_time2 += (parseFloat(time2[1]) * 2)
    }

    if(float_time1 < float_time2) {
        return time1
    }
    else {
        return time2
    }
}

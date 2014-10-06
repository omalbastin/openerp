openerp.zb_web_relativedelta = function (instance) {
	var _t = instance.web._t;
//	instance.web.pyeval = {};

    var obj = function () {};
    obj.prototype = py.object;
    var asJS = function (arg) {
        if (arg instanceof obj) {
            return arg.toJSON();
        }
        return arg;
    };
	var datetime = py.PY_call(py.object);
	
    var divmod = function (a, b, fn) {
        var mod = a%b;
        // in python, sign(a % b) === sign(b). Not in JS. If wrong side, add a
        // round of b
        if (mod > 0 && b < 0 || mod < 0 && b > 0) {
            mod += b;
        }
        return fn(Math.floor(a/b), mod);
    };
    /**
     * Passes the fractional and integer parts of x to the callback, returns
     * the callback's result
     */
    var modf = function (x, fn) {
        var mod = x%1;
        if (mod < 0) {
            mod += 1;
        }
        return fn(mod, Math.floor(x));
    };
    var zero = py.float.fromJSON(0);

    // Port from pypy/lib_pypy/datetime.py
    var DAYS_IN_MONTH = [null, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    var DAYS_BEFORE_MONTH = [null];
    var dbm = 0;
    for (var i=1; i<DAYS_IN_MONTH.length; ++i) {
        DAYS_BEFORE_MONTH.push(dbm);
        dbm += DAYS_IN_MONTH[i];
    }
    var is_leap = function (year) {
        return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    };
    var days_before_year = function (year) {
        var y = year - 1;
        return y*365 + Math.floor(y/4) - Math.floor(y/100) + Math.floor(y/400);
    };
    var days_in_month = function (year, month) {
        if (month === 2 && is_leap(year)) {
            return 29;
        }
        return DAYS_IN_MONTH[month];
    };
    var days_before_month = function (year, month) {
        var post_leap_feb = month > 2 && is_leap(year);
        return DAYS_BEFORE_MONTH[month]
             + (post_leap_feb ? 1 : 0);
    };
    var ymd2ord = function (year, month, day) {
        var dim = days_in_month(year, month);
        if (!(1 <= day && day <= dim)) {
            throw new Error("ValueError: day must be in 1.." + dim);
        }
        return days_before_year(year)
             + days_before_month(year, month)
             + day;
    };
    var DI400Y = days_before_year(401);
    var DI100Y = days_before_year(101);
    var DI4Y = days_before_year(5);
    var assert = function (bool) {
        if (!bool) {
            throw new Error("AssertionError");
        }
    };
    var ord2ymd = function (n) {
        --n;
        var n400, n100, n4, n1, n0;
        divmod(n, DI400Y, function (_n400, n) {
            n400 = _n400;
            divmod(n, DI100Y, function (_n100, n) {
                n100 = _n100;
                divmod(n, DI4Y, function (_n4, n) {
                    n4 = _n4;
                    divmod(n, 365, function (_n1, n) {
                        n1 = _n1;
                        n0 = n;
                    })
                });
            });
        });

        n = n0;
        var year = n400 * 400 + 1 + n100 * 100 + n4 * 4 + n1;
        if (n1 == 4 || n100 == 100) {
            assert(n0 === 0);
            return {
                year: year - 1,
                month: 12,
                day: 31
            };
        }

        var leapyear = n1 === 3 && (n4 !== 24 || n100 == 3);
        assert(leapyear == is_leap(year));
        var month = (n + 50) >> 5;
        var preceding = DAYS_BEFORE_MONTH[month] + ((month > 2 && leapyear) ? 1 : 0);
        if (preceding > n) {
            --month;
            preceding -= DAYS_IN_MONTH[month] + ((month === 2 && leapyear) ? 1 : 0);
        }
        n -= preceding;
        return {
            year: year,
            month: month,
            day: n+1
        };
    };

    /**
     * Converts the stuff passed in into a valid date, applying overflows as needed
     */
    var tmxxx = function (year, month, day, hour, minute, second, microsecond) {
        hour = hour || 0; minute = minute || 0; second = second || 0;
        microsecond = microsecond || 0;

        if (microsecond < 0 || microsecond > 999999) {
            divmod(microsecond, 1000000, function (carry, ms) {
                microsecond = ms;
                second += carry
            });
        }
        if (second < 0 || second > 59) {
            divmod(second, 60, function (carry, s) {
                second = s;
                minute += carry;
            });
        }
        if (minute < 0 || minute > 59) {
            divmod(minute, 60, function (carry, m) {
                minute = m;
                hour += carry;
            })
        }
        if (hour < 0 || hour > 23) {
            divmod(hour, 24, function (carry, h) {
                hour = h;
                day += carry;
            })
        }
        // That was easy.  Now it gets muddy:  the proper range for day
        // can't be determined without knowing the correct month and year,
        // but if day is, e.g., plus or minus a million, the current month
        // and year values make no sense (and may also be out of bounds
        // themselves).
        // Saying 12 months == 1 year should be non-controversial.
        if (month < 1 || month > 12) {
            divmod(month-1, 12, function (carry, m) {
                month = m + 1;
                year += carry;
            })
        }
        // Now only day can be out of bounds (year may also be out of bounds
        // for a datetime object, but we don't care about that here).
        // If day is out of bounds, what to do is arguable, but at least the
        // method here is principled and explainable.
        var dim = days_in_month(year, month);
        if (day < 1 || day > dim) {
            // Move day-1 days from the first of the month.  First try to
            // get off cheap if we're only one day out of range (adjustments
            // for timezone alone can't be worse than that).
            if (day === 0) {
                --month;
                if (month > 0) {
                    day = days_in_month(year, month);
                } else {
                    --year; month=12; day=31;
                }
            } else if (day == dim + 1) {
                ++month;
                day = 1;
                if (month > 12) {
                    month = 1;
                    ++year;
                }
            } else {
                var r = ord2ymd(ymd2ord(year, month, 1) + (day - 1));
                year = r.year;
                month = r.month;
                day = r.day;
            }
        }
        return {
            year: year,
            month: month,
            day: day,
            hour: hour,
            minute: minute,
            second: second,
            microsecond: microsecond
        };
    };
    datetime.timedelta = py.type('timedelta', null, {
        __init__: function () {
            var args = py.PY_parseArgs(arguments, [
                ['days', zero], ['seconds', zero], ['microseconds', zero],
                ['milliseconds', zero], ['minutes', zero], ['hours', zero],
                ['weeks', zero]
            ]);

            var d = 0, s = 0, m = 0;
            var days = args.days.toJSON() + args.weeks.toJSON() * 7;
            var seconds = args.seconds.toJSON()
                        + args.minutes.toJSON() * 60
                        + args.hours.toJSON() * 3600;
            var microseconds = args.microseconds.toJSON()
                             + args.milliseconds.toJSON() * 1000;

            // Get rid of all fractions, and normalize s and us.
            // Take a deep breath <wink>.
            var daysecondsfrac = modf(days, function (dayfrac, days) {
                d = days;
                if (dayfrac) {
                    return modf(dayfrac * 24 * 3600, function (dsf, dsw) {
                        s = dsw;
                        return dsf;
                    });
                }
                return 0;
            });

            var secondsfrac = modf(seconds, function (sf, s) {
                seconds = s;
                return sf + daysecondsfrac;
            });
            divmod(seconds, 24*3600, function (days, seconds) {
                d += days;
                s += seconds
            });
            // seconds isn't referenced again before redefinition

            microseconds += secondsfrac * 1e6;
            divmod(microseconds, 1000000, function (seconds, microseconds) {
                divmod(seconds, 24*3600, function (days, seconds) {
                    d += days;
                    s += seconds;
                    m += Math.round(microseconds);
                });
            });

            // Carrying still possible here?

            this.days = d;
            this.seconds = s;
            this.microseconds = m;
        },
        __str__: function () {
            var hh, mm, ss;
            divmod(this.seconds, 60, function (m, s) {
                divmod(m, 60, function (h, m) {
                    hh = h;
                    mm = m;
                    ss = s;
                });
            });
            var s = _.str.sprintf("%d:%02d:%02d", hh, mm, ss);
            if (this.days) {
                s = _.str.sprintf("%d day%s, %s",
                    this.days,
                    (this.days != 1 && this.days != -1) ? 's' : '',
                    s);
            }
            if (this.microseconds) {
                s = _.str.sprintf("%s.%06d", s, this.microseconds);
            }
            return py.str.fromJSON(s);
        },
        __eq__: function (other) {
            if (!py.PY_isInstance(other, datetime.timedelta)) {
                return py.False;
            }
            return (this.days === other.days
                && this.seconds === other.seconds
                && this.microseconds === other.microseconds)
                    ? py.True : py.False;
        },
        __add__: function (other) {
            if (!py.PY_isInstance(other, datetime.timedelta)) {
                return py.NotImplemented;
            }
            return py.PY_call(datetime.timedelta, [
                py.float.fromJSON(this.days + other.days),
                py.float.fromJSON(this.seconds + other.seconds),
                py.float.fromJSON(this.microseconds + other.microseconds)
            ]);
        },
        __radd__: function (other) { return this.__add__(other); },
        __sub__: function (other) {
            if (!py.PY_isInstance(other, datetime.timedelta)) {
                return py.NotImplemented;
            }
            return py.PY_call(datetime.timedelta, [
                py.float.fromJSON(this.days - other.days),
                py.float.fromJSON(this.seconds - other.seconds),
                py.float.fromJSON(this.microseconds - other.microseconds)
            ]);
        },
        __rsub__: function (other) {
            if (!py.PY_isInstance(other, datetime.timedelta)) {
                return py.NotImplemented;
            }
            return this.__neg__().__add__(other);
        },
        __neg__: function () {
            return py.PY_call(datetime.timedelta, [
                py.float.fromJSON(-this.days),
                py.float.fromJSON(-this.seconds),
                py.float.fromJSON(-this.microseconds)
            ]);
        },
        __pos__: function () { return this; },
        __mul__: function (other) {
            if (!py.PY_isInstance(other, py.float)) {
                return py.NotImplemented;
            }
            var n = other.toJSON();
            return py.PY_call(datetime.timedelta, [
                py.float.fromJSON(this.days * n),
                py.float.fromJSON(this.seconds * n),
                py.float.fromJSON(this.microseconds * n)
            ]);
        },
        __rmul__: function (other) { return this.__mul__(other); },
        __div__: function (other) {
            if (!py.PY_isInstance(other, py.float)) {
                return py.NotImplemented;
            }
            var usec = ((this.days * 24 * 3600) + this.seconds) * 1000000
                        + this.microseconds;
            return py.PY_call(
                datetime.timedelta, [
                    zero, zero, py.float.fromJSON(usec / other.toJSON())]);
        },
        __floordiv__: function (other) { return this.__div__(other); },
        total_seconds: function () {
            return py.float.fromJSON(
                this.days * 86400
              + this.seconds
              + this.microseconds / 1000000)
        },
        __nonzero__: function () {
            return (!!this.days || !!this.seconds || !!this.microseconds)
                ? py.True
                : py.False;
        }
    });
    datetime.datetime = py.type('datetime', null, {
        __init__: function () {
            var zero = py.float.fromJSON(0);
            var args = py.PY_parseArgs(arguments, [
                'year', 'month', 'day',
                ['hour', zero], ['minute', zero], ['second', zero],
                ['microsecond', zero], ['tzinfo', py.None]
            ]);
            for(var key in args) {
                if (!args.hasOwnProperty(key)) { continue; }
                this[key] = asJS(args[key]);
            }
        },
        strftime: function () {
            var self = this;
            var args = py.PY_parseArgs(arguments, 'format');
            return py.str.fromJSON(args.format.toJSON()
                .replace(/%([A-Za-z])/g, function (m, c) {
                    switch (c) {
                    case 'Y': return self.year;
                    case 'm': return _.str.sprintf('%02d', self.month);
                    case 'd': return _.str.sprintf('%02d', self.day);
                    case 'H': return _.str.sprintf('%02d', self.hour);
                    case 'M': return _.str.sprintf('%02d', self.minute);
                    case 'S': return _.str.sprintf('%02d', self.second);
                    }
                    throw new Error('ValueError: No known conversion for ' + m);
                }));
        },
        now: py.classmethod.fromJSON(function () {
            var d = new Date();
            return py.PY_call(datetime.datetime,
                [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(),
                 d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(),
                 d.getUTCMilliseconds() * 1000]);
        }),
        combine: py.classmethod.fromJSON(function () {
            var args = py.PY_parseArgs(arguments, 'date time');
            return py.PY_call(datetime.datetime, [
                py.PY_getAttr(args.date, 'year'),
                py.PY_getAttr(args.date, 'month'),
                py.PY_getAttr(args.date, 'day'),
                py.PY_getAttr(args.time, 'hour'),
                py.PY_getAttr(args.time, 'minute'),
                py.PY_getAttr(args.time, 'second')
            ]);
        })
    });
    datetime.date = py.type('date', null, {
        __init__: function () {
            var args = py.PY_parseArgs(arguments, 'year month day');
            this.year = asJS(args.year);
            this.month = asJS(args.month);
            this.day = asJS(args.day);
        },
        strftime: function () {
            var self = this;
            var args = py.PY_parseArgs(arguments, 'format');
            return py.str.fromJSON(args.format.toJSON()
                .replace(/%([A-Za-z])/g, function (m, c) {
                    switch (c) {
                    case 'Y': return self.year;
                    case 'm': return _.str.sprintf('%02d', self.month);
                    case 'd': return _.str.sprintf('%02d', self.day);
                    }
                    throw new Error('ValueError: No known conversion for ' + m);
                }));
        },
        __eq__: function (other) {
            return (this.year === other.year
                 && this.month === other.month
                 && this.day === other.day)
                ? py.True : py.False;
        },
        __add__: function (other) {
            if (!py.PY_isInstance(other, datetime.timedelta)) {
                return py.NotImplemented;
            }
            var s = tmxxx(this.year, this.month, this.day + other.days);
            return datetime.date.fromJSON(s.year, s.month, s.day);
        },
        __radd__: function (other) { return this.__add__(other); },
        __sub__: function (other) {
            if (py.PY_isInstance(other, datetime.timedelta)) {
                return this.__add__(other.__neg__());
            }
            if (py.PY_isInstance(other, datetime.date)) {
                // FIXME: getattr and sub API methods
                return py.PY_call(datetime.timedelta, [
                    py.PY_subtract(
                        py.PY_call(py.PY_getAttr(this, 'toordinal')),
                        py.PY_call(py.PY_getAttr(other, 'toordinal')))
                ]);
            }
            return py.NotImplemented;
        },
        toordinal: function () {
            return py.float.fromJSON(ymd2ord(this.year, this.month, this.day));
        },
        fromJSON: function (year, month, day) {
            return py.PY_call(datetime.date, [year, month, day])
        }
    });
    /**
        Returns the current local date, which means the date on the client (which can be different
        compared to the date of the server).

        @return {datetime.date}
    */
    var context_today = function() {
        var d = new Date();
        return py.PY_call(
            datetime.date, [d.getFullYear(), d.getMonth() + 1, d.getDate()]);
    };
    datetime.time = py.type('time', null, {
        __init__: function () {
            var zero = py.float.fromJSON(0);
            var args = py.PY_parseArgs(arguments, [
                ['hour', zero], ['minute', zero], ['second', zero], ['microsecond', zero],
                ['tzinfo', py.None]
            ]);

            for(var k in args) {
                if (!args.hasOwnProperty(k)) { continue; }
                this[k] = asJS(args[k]);
            }
        }
    });
    var time = py.PY_call(py.object);
    time.strftime = py.PY_def.fromJSON(function () {
        var args  = py.PY_parseArgs(arguments, 'format');
        var dt_class = py.PY_getAttr(datetime, 'datetime');
        var d = py.PY_call(py.PY_getAttr(dt_class, 'now'));
        return py.PY_call(py.PY_getAttr(d, 'strftime'), [args.format]);
    });

    var relativedelta = py.type('relativedelta', null, {
        __init__: function() {
            this.ops = py.PY_parseArgs(
                arguments,
                [
                    ['year', null],
                    ['years', null],
                    ['month', null],
                    ['months', null],
                    ['day', null],
                    ['days', null],
                    ['hour', null],
                    ['hours', null],
                    ['minute', null],
                    ['minutes', null],
                    ['second', null],
                    ['seconds', null],
                    ['weeks', null],
                    ['weekday', null],
                ]);
        },
        __add__: function(other) {
            if(!py.PY_isInstance(other, datetime.date) &&
               !py.PY_isInstance(other, datetime.datetime)) {
                return py.NotImplemented;
            }

            var result = moment({
                year: other.year,
                //january==0 in moment.js
                month: other.month - 1,
                day: other.day,
                hour: other.hour,
                minute: other.minute,
                second: other.second});

            if(this.ops.year) {
                result.year(Math.abs(this.ops.year._value));
            }
            if(this.ops.years) {
                result.add('years', this.ops.years._value);
            }
            if(this.ops.month) {
                //january==0 in moment.js
                result.month(Math.abs(this.ops.month._value % 13) - 1);
            }
            if(this.ops.months) {
                result.add('months', this.ops.months._value);
            }
            if(this.ops.day) {
                result = result.clone()
                    .endOf('month')
                    .hours(result.hours())
                    .minutes(result.minutes())
                    .seconds(result.seconds())
                    .max(result.clone()
                            .date(Math.abs(this.ops.day._value)));
            }
            if(this.ops.days) {
                result.add('days', this.ops.days._value)
            }
            if(this.ops.weeks) {
                result.add('days', this.ops.weeks._value * 7);
            }
            if(this.ops.hour) {
                result.hour(Math.abs(this.ops.hour._value % 24));
            }
            if(this.ops.hours) {
                result.add('hours', this.ops.hours._value);
            }
            if(this.ops.minute) {
                result.minute(Math.abs(this.ops.minute._value % 60));
            }
            if(this.ops.minutes) {
                result.add('minutes', this.ops.minutes._value);
            }
             if(this.ops.second) {
                result.second(Math.abs(this.ops.second._value % 60));
            }
            if(this.ops.seconds) {
                result.add('seconds', this.ops.seconds._value);
            }
            if(this.ops.weekday) {
                //in relativedelta, 0=MO, but in iso, 1=MO
                var isoWeekday = Math.abs(this.ops.weekday._value || 1) /
                    (this.ops.weekday._value || 1) *
                    (Math.abs(this.ops.weekday._value) + 1),
                    originalIsoWeekday = result.isoWeekday();
                result.isoWeekday(isoWeekday).add(
                        'weeks', isoWeekday < originalIsoWeekday ? 1 : 0);
            }

            var args = [
                result.year(),
                //january==0 in moment.js
                result.month() + 1,
                result.date(),
            ];
            if(py.PY_isInstance(other, datetime.datetime)) {
                args.push(result.hour());
                args.push(result.minute());
                args.push(result.second());
            }

            return py.PY_call(Object.getPrototypeOf(other), args);
        },
        __radd__: function(other) {
            return this.__add__(other);
        },
        __sub__: function(other) {
            _.each(this.ops, function(op, name) {
                if(!op || name == 'weekday') {
                    return;
                }
                op._value = -op._value;
            });
            return this.__add__(other);
        },
        __rsub__: function(other) {
            return this.__sub__(other);
        }
    });

       //modifying the base function
       instance.web.pyeval.context = function () {
    	   console.log({datetime: datetime,
               context_today: context_today,
               time: time,
               relativedelta: relativedelta,
               current_date: py.PY_call(
                   time.strftime, [py.str.fromJSON('%Y-%m-%d')]),})
           return _.extend({
               datetime: datetime,
               context_today: context_today,
               time: time,
               relativedelta: relativedelta,
               current_date: py.PY_call(
                   time.strftime, [py.str.fromJSON('%Y-%m-%d')]),
           }, instance.session.user_context);
       };


}
	
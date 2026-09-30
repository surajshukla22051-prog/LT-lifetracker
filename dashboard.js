(function () {
    "use strict";

    const currentUser = JSON.parse(localStorage.getItem("lifetrack-user") || "null");
    if (!currentUser || !currentUser.name) {
        window.location.href = "index.html";
        return;
    }

    /* ---- per-account storage: every login gets its own private slot in this browser ---- */
    const CFG = window.LT_CONFIG || {};
    const GID = CFG.GOOGLE_CLIENT_ID || "";
    const HEALTH_ON = Boolean(CFG.GOOGLE_HEALTH) && /^[0-9]+-.+\.apps\.googleusercontent\.com$/.test(GID);

    if (!currentUser.uid) {
        currentUser.uid = currentUser.name === "Guest" ? "guest"
            : currentUser.email ? "e_" + currentUser.email.toLowerCase()
            : "n_" + currentUser.name.toLowerCase().replace(/\s+/g, " ");
        localStorage.setItem("lifetrack-user", JSON.stringify(currentUser));
    }
    const NS = "lifetrack:" + currentUser.uid + ":";
    const store = {
        get: (k) => localStorage.getItem(NS + k),
        set: (k, v) => localStorage.setItem(NS + k, v),
        remove: (k) => localStorage.removeItem(NS + k)
    };
    // one time only: the first account to open the app after this update keeps the data saved by the old single-user version
    if (!localStorage.getItem("lifetrack-migrated")) {
        ["habits", "checks", "habit-start", "body", "goals", "fitness"].forEach((k) => {
            const old = localStorage.getItem("lifetrack-" + k);
            if (old !== null && localStorage.getItem(NS + k) === null) localStorage.setItem(NS + k, old);
        });
        localStorage.setItem("lifetrack-migrated", "1");
    }

    const monthSelect = document.getElementById("monthSelect");
    const yearSelect = document.getElementById("yearSelect");
    const calendarHead = document.getElementById("calendarHead");
    const habitBody = document.getElementById("habitBody");
    const habitCount = document.getElementById("habitCount");
    const completedCount = document.getElementById("completedCount");
    const completionChart = document.getElementById("completionChart");
    const tableWrapper = document.querySelector(".table-wrapper");
    const dailyReminder = document.getElementById("dailyReminder");
    const goalAnalysis = document.getElementById("goalAnalysis");
    const habitManageList = document.getElementById("habitManageList");
    const goalPageList = document.getElementById("goalPageList");
    const analyticsSummary = document.getElementById("analyticsSummary");
    const themeToggle = document.getElementById("themeToggle");
    const userName = document.getElementById("userName");
    const profileLetter = document.getElementById("profileLetter");



    const monthNames = Array.from(monthSelect.options).map((option) => option.textContent);
    let habits = JSON.parse(store.get("habits")) || [
        "Wake up early",
        "Workout",
        "Read",
        "Meditation",
        "No junk food"
    ];
    let checks = JSON.parse(store.get("checks")) || {};
    let habitStarts = JSON.parse(store.get("habit-start") || "{}");
    let bodyProfile = JSON.parse(store.get("body") || "null");
    let editingBody = false;
    let lastLife = null;
    let renderedDay = null;

    /* ===================== dates + lifetime progress ===================== */

    const DAY_MS = 86400000;

    function todayUTC() {
        const n = new Date();
        return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
    }

    function isoFromUTC(ms) {
        const d = new Date(ms);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    }

    function utcFromISO(s) {
        const [y, m, d] = s.split("-").map(Number);
        return Date.UTC(y, m - 1, d);
    }

    function keyFor(ms, habit) {
        const d = new Date(ms);
        return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}-${habit}`;
    }

    function fmtDate(ms) {
        return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    }

    // Walks every saved tick (all months, all years) up to today: first tick ever + per-habit counts.
    function scanTicks() {
        const t0 = todayUTC();
        const per = {};
        let first = null;
        Object.keys(checks).forEach((key) => {
            if (!checks[key]) return;
            const m = /^(\d{4})-(\d{1,2})-(\d{1,2})-(.+)$/.exec(key);
            if (!m) return;
            const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
            if (t > t0) return;
            if (first === null || t < first) first = t;
            const rec = per[m[4]] || (per[m[4]] = { first: t, count: 0 });
            if (t < rec.first) rec.first = t;
            rec.count += 1;
        });
        return { per, first };
    }

    // A habit starts counting from the day it was added (or its first tick, whichever is earlier).
    function ensureHabitStarts(scan) {
        let changed = false;
        habits.forEach((habit) => {
            if (!habitStarts[habit]) {
                habitStarts[habit] = isoFromUTC(scan.first !== null ? scan.first : todayUTC());
                changed = true;
            }
        });
        if (changed) saveState();
    }

    function habitStartMs(habit, scan) {
        const t0 = todayUTC();
        let start = habitStarts[habit] ? utcFromISO(habitStarts[habit]) : t0;
        const rec = scan.per[habit];
        if (rec && rec.first < start) start = rec.first;
        return Math.min(start, t0);
    }

    // Lifetime ("overall") progress: every tick since the very first one, across all months and years.
    function computeLifetime() {
        const scan = scanTicks();
        ensureHabitStarts(scan);
        const t0 = todayUTC();
        let ticks = 0;
        let window = 0;
        let recentTicks = 0;
        let recentPossible = 0;
        let todayDone = 0;

        habits.forEach((habit) => {
            const start = habitStartMs(habit, scan);
            const rec = scan.per[habit];
            window += Math.round((t0 - start) / DAY_MS) + 1;
            ticks += rec ? rec.count : 0;
            if (checks[keyFor(t0, habit)]) todayDone += 1;

            for (let i = 0; i < 7; i += 1) {
                const t = t0 - i * DAY_MS;
                if (t < start) break;
                recentPossible += 1;
                if (checks[keyFor(t, habit)]) recentTicks += 1;
            }
        });

        return {
            percent: window ? Math.round((ticks / window) * 100) : 0,
            first: scan.first,
            spanDays: scan.first === null ? 0 : Math.round((t0 - scan.first) / DAY_MS) + 1,
            recent: recentPossible ? Math.round((recentTicks / recentPossible) * 100) : 0,
            todayDone,
            scan
        };
    }

    // Daily target: starts gentle for beginners, rises with lifetime progress + last-7-day consistency.
    function computeDailyTarget(life) {
        const n = habits.length;
        if (!n) return { pct: 0, goal: 0 };
        let raw = 50 + life.percent * 0.4;   // 50% (new) .. 90% (mastered)
        if (life.recent >= 70) raw += 5;      // consistency bonus
        if (life.recent >= 85) raw += 5;
        raw = Math.min(100, raw);
        const goal = Math.min(n, Math.max(1, Math.round((n * raw) / 100)));
        return { pct: Math.round((goal / n) * 100), goal };
    }

    function storageKey(day, habit) {
        return `${yearSelect.value}-${monthSelect.selectedIndex + 1}-${day}-${habit}`;
    }

    function setLiveMonthAndYear() {
        const today = new Date();
        const currentYear = String(today.getFullYear());
        monthSelect.selectedIndex = today.getMonth();

        if (!Array.from(yearSelect.options).some((option) => option.value === currentYear)) {
            yearSelect.add(new Option(currentYear, currentYear));
        }

        yearSelect.value = currentYear;
    }

    function saveState() {
        store.set("habits", JSON.stringify(habits));
        store.set("checks", JSON.stringify(checks));
        store.set("habit-start", JSON.stringify(habitStarts));
    }

    function getDaysInSelectedMonth() {
        return new Date(Number(yearSelect.value), monthSelect.selectedIndex + 1, 0).getDate();
    }

    function createCell(tag, text) {
        const cell = document.createElement(tag);
        cell.textContent = text;
        return cell;
    }

    function renderCalendar() {
        const days = getDaysInSelectedMonth();
        const today = new Date();
        const t0 = todayUTC();
        renderedDay = t0;
        const isLiveMonth = today.getMonth() === monthSelect.selectedIndex && today.getFullYear() === Number(yearSelect.value);

        calendarHead.innerHTML = "";
        habitBody.innerHTML = "";

        const headerRow = document.createElement("tr");
        headerRow.appendChild(createCell("th", `${monthNames[monthSelect.selectedIndex]} Habits`));

        let todayTh = null;
        for (let day = 1; day <= days; day += 1) {
            const th = createCell("th", day);
            if (isLiveMonth && day === today.getDate()) {
                th.classList.add("today-cell");
                todayTh = th;
            }
            headerRow.appendChild(th);
        }

        calendarHead.appendChild(headerRow);

        habits.forEach((habit) => {
            const row = document.createElement("tr");
            row.appendChild(createCell("td", habit));

            for (let day = 1; day <= days; day += 1) {
                const cell = document.createElement("td");
                if (isLiveMonth && day === today.getDate()) cell.classList.add("today-cell");

                // only past days and today can be ticked; anything after today stays locked
                const cellUTC = Date.UTC(Number(yearSelect.value), monthSelect.selectedIndex, day);
                const locked = cellUTC > t0;

                const label = document.createElement("label");
                label.className = "habit-box" + (locked ? " locked" : "");
                label.title = locked
                    ? "Future day: locked"
                    : `${habit} · ${day} ${monthNames[monthSelect.selectedIndex]}`;

                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.className = "habit-check";
                checkbox.checked = !locked && Boolean(checks[storageKey(day, habit)]);
                checkbox.disabled = locked;
                checkbox.setAttribute("aria-label", `${habit}, ${monthNames[monthSelect.selectedIndex]} ${day}${locked ? " (locked)" : ""}`);

                const box = document.createElement("span");
                box.className = "box";
                box.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>';

                checkbox.addEventListener("change", () => {
                    if (locked) {
                        checkbox.checked = false;
                        return;
                    }
                    checks[storageKey(day, habit)] = checkbox.checked;
                    if (checkbox.checked) {
                        box.classList.remove("pop");
                        void box.offsetWidth;
                        box.classList.add("pop");
                    }
                    saveState();
                    renderStats();
                });

                label.appendChild(checkbox);
                label.appendChild(box);
                cell.appendChild(label);
                row.appendChild(cell);
            }

            habitBody.appendChild(row);
        });

        renderStats();
        scrollIntoViewCentered(tableWrapper, todayTh);
    }

    function scrollIntoViewCentered(wrapper, el) {
        if (!wrapper || !el) return;
        const doScroll = () => {
            const target = el.offsetLeft - (wrapper.clientWidth / 2) + (el.offsetWidth / 2);
            wrapper.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
        };
        requestAnimationFrame(() => requestAnimationFrame(doScroll));
        // fonts/images can settle sizes a beat late on first paint — nudge again once things are fully loaded
        window.addEventListener("load", doScroll, { once: true });
    }

    /* ===================== reusable inline graphics ===================== */

    // Circular progress ring. Returns an <svg> string; the stroke animates in
    // via CSS once .ring-progress gets its real stroke-dashoffset (see animateRings).
    function ringSVG(percent, opts) {
        const size = (opts && opts.size) || 96;
        const stroke = (opts && opts.stroke) || 9;
        const color = (opts && opts.color) || "var(--primary)";
        const clamped = Math.max(0, Math.min(100, percent));
        const r = (size - stroke) / 2;
        const c = 2 * Math.PI * r;
        const offset = c * (1 - clamped / 100);
        const mid = size / 2;
        const fontSize = Math.round(size * 0.22);
        return `<svg class="ring-svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${Math.round(clamped)}% complete">
            <circle class="ring-track" cx="${mid}" cy="${mid}" r="${r}" stroke-width="${stroke}"></circle>
            <circle class="ring-progress" cx="${mid}" cy="${mid}" r="${r}" stroke-width="${stroke}" stroke="${color}"
                stroke-dasharray="${c}" stroke-dashoffset="${c}" data-offset="${offset}"
                transform="rotate(-90 ${mid} ${mid})"></circle>
            <text class="ring-text" x="${mid}" y="${mid}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}">${Math.round(clamped)}%</text>
        </svg>`;
    }

    // Kicks the just-inserted rings from 0 -> their real offset so the stroke sweeps in.
    function animateRings(container) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                container.querySelectorAll(".ring-progress[data-offset]").forEach((circle) => {
                    circle.style.strokeDashoffset = circle.dataset.offset;
                });
            });
        });
    }

    // Colour zones for the Overall Progress dial (0-25 red, 25-50 orange, 50-75 yellow, 75-100 green).
    const GAUGE_ZONES = [
        { key: "red",    from: 0,  to: 25,  label: "Needs Focus",   msg: "Just getting started. Tick off one habit today." },
        { key: "orange", from: 25, to: 50,  label: "Keep Pushing",  msg: "You're moving. Stay consistent." },
        { key: "yellow", from: 50, to: 75,  label: "Good Progress", msg: "Solid work. Don't break the chain." },
        { key: "green",  from: 75, to: 100, label: "Excellent!",    msg: "Outstanding discipline. Keep it up!" }
    ];

    function getGaugeZone(percent) {
        const p = Math.max(0, Math.min(100, percent));
        if (p >= 75) return GAUGE_ZONES[3];
        if (p >= 50) return GAUGE_ZONES[2];
        if (p >= 25) return GAUGE_ZONES[1];
        return GAUGE_ZONES[0];
    }

    // Semi-circle "dial" gauge with a swinging needle. 0% = far left (horizontal), 50% = straight up, 100% = far right.
    function gaugeSVG(percent, muted) {
        const clamped = Math.max(0, Math.min(100, percent));
        const w = 220;
        const h = 150;
        const cx = w / 2;
        const cy = 108;
        const r = 88;
        const stroke = 16;
        const gap = 2; // degrees of gap between colour zones

        // point on the dial: 0% -> 180deg (left), 100% -> 360deg (right), sweeping over the top
        const pt = (pct, radius) => {
            const rad = ((180 + (pct / 100) * 180) * Math.PI) / 180;
            return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
        };
        const gapPct = (gap / 180) * 100;

        let dim = "";
        let bright = "";
        GAUGE_ZONES.forEach((zone, i) => {
            const a = pt(zone.from + (i === 0 ? 0 : gapPct / 2), r);
            const b = pt(zone.to - (i === GAUGE_ZONES.length - 1 ? 0 : gapPct / 2), r);
            const d = `M ${a[0].toFixed(2)} ${a[1].toFixed(2)} A ${r} ${r} 0 0 1 ${b[0].toFixed(2)} ${b[1].toFixed(2)}`;
            const fill = Math.max(0, Math.min(1, (clamped - zone.from) / (zone.to - zone.from)));
            dim += `<path class="gauge-zone-dim zone-${zone.key}" d="${d}" stroke-width="${stroke}"></path>`;
            bright += `<path class="gauge-zone zone-${zone.key}" d="${d}" stroke-width="${stroke}" pathLength="100"
                stroke-dasharray="100" stroke-dashoffset="100" data-offset="${(100 * (1 - fill)).toFixed(2)}" style="transition-delay:${i * 180}ms"></path>`;
        });

        const needleLen = r - stroke - 2;
        const tip = pt(clamped, needleLen);
        const zone = getGaugeZone(clamped);
        return `<svg class="gauge-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${Math.round(clamped)}% overall progress: ${zone.label}">
            ${dim}
            ${bright}
            <line class="gauge-needle" x1="${cx}" y1="${cy}" x2="${cx - needleLen}" y2="${cy}" data-x2="${tip[0].toFixed(2)}" data-y2="${tip[1].toFixed(2)}"></line>
            <circle class="gauge-pivot" cx="${cx}" cy="${cy}" r="6"></circle>
            <text class="gauge-value ${muted ? "zone-text-none" : `zone-text-${zone.key}`}" x="${cx}" y="${cy + 34}" text-anchor="middle">${Math.round(clamped)}%</text>
        </svg>`;
    }

    function animateGauge(container) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                container.querySelectorAll(".gauge-zone[data-offset]").forEach((seg) => {
                    seg.style.strokeDashoffset = seg.dataset.offset;
                });
                const needle = container.querySelector(".gauge-needle[data-x2]");
                if (needle) {
                    needle.setAttribute("x2", needle.dataset.x2);
                    needle.setAttribute("y2", needle.dataset.y2);
                }
            });
        });
    }

    // Smooth-ish line + gradient-fill area chart. `values` is one number per day;
    // `max` sets the top of the y-axis (defaults to the highest value, min 1).
    /* ======================================================================= */

    function renderStats() {
        const days = getDaysInSelectedMonth();
        const total = habits.length * days;
        let completed = 0;
        const dailyTotals = Array.from({ length: days }, () => 0);

        habits.forEach((habit) => {
            for (let day = 1; day <= days; day += 1) {
                if (checks[storageKey(day, habit)]) {
                    completed += 1;
                    dailyTotals[day - 1] += 1;
                }
            }
        });

        const percent = total ? Math.round((completed / total) * 100) : 0;
        habitCount.textContent = habits.length;
        completedCount.innerHTML = `${completed}<span class="stat-total"> / ${total}</span>`;

        const life = computeLifetime();
        lastLife = life;
        ctx = buildContext(life);
        renderProgressGauge(percent);
        renderHabitLegend();
        renderCompletedCard(dailyTotals);
        renderDailyChart(dailyTotals);
        renderDailyReminder(life);
        renderGoalAnalysis(percent, life);
        renderWeekStrip();
        renderRadarsAndStreaks();
        renderFitness();
        renderBadges();
        renderManageList();
        renderGoalsPage();
        renderAnalytics(percent, completed, total, dailyTotals);
    }

    // Overall Progress = the selected month only. It starts from 0% on the 1st of every month.
    function renderProgressGauge(percent) {
        const year = Number(yearSelect.value);
        const monthIdx = monthSelect.selectedIndex;
        const t0 = todayUTC();
        const monthStart = Date.UTC(year, monthIdx, 1);
        const monthDays = getDaysInSelectedMonth();
        const monthEnd = Date.UTC(year, monthIdx, monthDays);
        const started = monthStart <= t0;

        const gaugeEl = document.getElementById("progressGauge");
        gaugeEl.innerHTML = gaugeSVG(percent, !started);
        animateGauge(gaugeEl);

        const feedback = document.getElementById("progressFeedback");
        if (!feedback) return;

        const label = `${monthNames[monthIdx]} ${year}`;
        if (!started) {
            feedback.innerHTML = `<strong class="gauge-feedback-title zone-text-none">Upcoming</strong><span>This month hasn't started yet.</span><small class="gauge-since">${label}</small>`;
            return;
        }
        const zone = getGaugeZone(percent);
        const sub = monthEnd < t0
            ? `${label} · final result`
            : `${label} · day ${Math.round((t0 - monthStart) / DAY_MS) + 1} of ${monthDays} · resets next month`;
        feedback.innerHTML = `<strong class="gauge-feedback-title zone-text-${zone.key}">${zone.label}</strong><span>${zone.msg}</span><small class="gauge-since">${sub}</small>`;
    }

    /* ===================== daily reminder (body + progress based) ===================== */

    const TIERS = [
        { name: "Easy",     rounds: 2, rest: 60, steps: 5000 },
        { name: "Easy–Mid", rounds: 3, rest: 45, steps: 7000 },
        { name: "Hard–Mid", rounds: 3, rest: 40, steps: 9000 },
        { name: "Hard",     rounds: 4, rest: 30, steps: 11000 }
    ];

    const WORKOUTS = {
        recovery: { title: "Active Recovery", pool: [
            { n: "Easy walk", u: "min", v: [15, 20, 25, 30] },
            { n: "Hamstring stretch (each leg)", u: "sec", v: [20, 25, 30, 40] },
            { n: "Neck & shoulder rolls", u: "reps", v: [8, 10, 12, 15] },
            { n: "Deep breathing", u: "min", v: [3, 5, 5, 8] },
            { n: "Hip opener stretch (each side)", u: "sec", v: [20, 25, 30, 40] }
        ] },
        upper: { title: "Upper Body", pool: [
            { n: "Push-ups", low: "Incline push-ups (wall or table)", u: "reps", v: [6, 10, 15, 22] },
            { n: "Chair dips", u: "reps", v: [6, 10, 14, 20] },
            { n: "Plank shoulder taps", low: "Knee plank shoulder taps", u: "reps", v: [8, 14, 20, 30] },
            { n: "Superman hold", u: "sec", v: [15, 20, 30, 40] },
            { n: "Arm circles", u: "reps", v: [20, 30, 40, 50] }
        ] },
        lower: { title: "Lower Body", pool: [
            { n: "Bodyweight squats", u: "reps", v: [10, 15, 22, 30] },
            { n: "Reverse lunges (each leg)", low: "Supported split squats (each leg)", u: "reps", v: [6, 8, 12, 16] },
            { n: "Glute bridges", u: "reps", v: [10, 15, 20, 28] },
            { n: "Wall sit", u: "sec", v: [20, 30, 45, 60] },
            { n: "Calf raises", u: "reps", v: [15, 20, 28, 36] }
        ] },
        core: { title: "Core & Mobility", pool: [
            { n: "Plank", u: "sec", v: [15, 25, 40, 60] },
            { n: "Dead bug (each side)", u: "reps", v: [6, 8, 12, 16] },
            { n: "Bicycle crunches", u: "reps", v: [10, 16, 24, 32] },
            { n: "Leg raises", low: "Bent-knee leg raises", u: "reps", v: [6, 10, 14, 20] },
            { n: "Cat-cow stretch", u: "reps", v: [8, 10, 12, 12] }
        ] },
        cardio: { title: "Cardio", pool: [
            { n: "Brisk walk", u: "min", v: [15, 20, 30, 40] },
            { n: "Jumping jacks", low: "Step jacks (no jumping)", u: "reps", v: [20, 30, 45, 60] },
            { n: "High knees", low: "Marching in place", u: "sec", v: [20, 30, 40, 60] },
            { n: "Shadow boxing", u: "sec", v: [30, 45, 60, 90] },
            { n: "Skipping or stair climb", low: "Slow stair climb", u: "min", v: [3, 5, 8, 12] }
        ] },
        full: { title: "Full Body", pool: [
            { n: "Burpees", low: "Squat, then step-back plank", u: "reps", v: [4, 6, 10, 15] },
            { n: "Mountain climbers", low: "Slow mountain climbers", u: "sec", v: [15, 20, 30, 45] },
            { n: "Squat to press (use a water bottle)", u: "reps", v: [8, 12, 16, 20] },
            { n: "Push-ups", low: "Incline push-ups (wall or table)", u: "reps", v: [6, 10, 15, 22] },
            { n: "Glute bridges", u: "reps", v: [10, 15, 20, 28] }
        ] }
    };

    // Sunday .. Saturday
    const WEEK_PLAN = ["recovery", "upper", "lower", "cardio", "core", "full", "cardio"];

    const LEVEL_MSG = [
        "Building your base. Keep today light and doable.",
        "Getting stronger. A little more effort than before.",
        "You're consistent. Time to push a bit harder.",
        "Top level. Full intensity, but respect recovery."
    ];

    const DAILY_TIPS = [
        "Drink a glass of water right after waking up.",
        "Take a 5-minute walk after meals. It helps digestion and focus.",
        "Keep your phone away from bed for the last 30 minutes before sleep.",
        "Add protein and vegetables to at least two meals today.",
        "If you sit for long, stand up and stretch every hour.",
        "10 minutes of morning sunlight helps you sleep better at night.",
        "Plan tomorrow's habits tonight. It takes 2 minutes.",
        "Never skip the warm-up. 5 minutes saves you from injuries.",
        "Sleep is when your body actually recovers. Protect 7 to 8 hours.",
        "Don't compare your day 1 with someone else's day 500.",
        "Swap one sugary drink for water or plain tea today.",
        "Posture check: shoulders back, chin level, feet flat.",
        "A 10-minute workout beats a skipped workout. Small wins count.",
        "Eat one meal today slowly and without screens."
    ];

    function bodyInfo() {
        const hm = bodyProfile.height / 100;
        const bmi = bodyProfile.weight / (hm * hm);
        const label = bmi < 18.5 ? "Underweight" : bmi < 25 ? "Healthy" : bmi < 30 ? "Overweight" : "Obese";
        return { bmi, label };
    }

    function bodyFormHTML() {
        return `<form class="body-form" id="bodyForm" novalidate>
            <label>Height (cm)<input id="bfHeight" type="number" inputmode="decimal" min="100" max="250" placeholder="170"></label>
            <label>Weight (kg)<input id="bfWeight" type="number" inputmode="decimal" min="25" max="250" step="0.1" placeholder="65"></label>
            <label>Body size<select id="bfSize">
                <option value="S">S</option><option value="M" selected>M</option><option value="L">L</option>
                <option value="XL">XL</option><option value="XXL">XXL</option>
            </select></label>
            <p class="body-form-error" id="bfError">Enter height between 100 and 250 cm and weight between 25 and 250 kg.</p>
            <div class="body-form-actions">
                <button type="submit" class="primary-button">Save &amp; build my plan</button>
                ${bodyProfile ? '<button type="button" class="secondary-button" id="bfCancel">Cancel</button>' : ""}
            </div>
        </form>`;
    }

    function wireBodyForm() {
        const form = document.getElementById("bodyForm");
        if (!form) return;
        if (bodyProfile) {
            document.getElementById("bfHeight").value = bodyProfile.height;
            document.getElementById("bfWeight").value = bodyProfile.weight;
            document.getElementById("bfSize").value = bodyProfile.size;
        }
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            const height = parseFloat(document.getElementById("bfHeight").value);
            const weight = parseFloat(document.getElementById("bfWeight").value);
            const size = document.getElementById("bfSize").value;
            if (!(height >= 100 && height <= 250) || !(weight >= 25 && weight <= 250)) {
                document.getElementById("bfError").style.display = "block";
                return;
            }
            bodyProfile = { height, weight, size };
            store.set("body", JSON.stringify(bodyProfile));
            editingBody = false;
            renderDailyReminder(lastLife || computeLifetime());
        });
        const cancel = document.getElementById("bfCancel");
        if (cancel) {
            cancel.addEventListener("click", () => {
                editingBody = false;
                renderDailyReminder(lastLife || computeLifetime());
            });
        }
    }

    // Refreshes every day: the focus follows the weekday, the exercise mix + tip rotate by date,
    // and difficulty follows the lifetime Overall Progress colour (red = easy ... green = hard).
    function renderDailyReminder(life) {
        const zone = getGaugeZone(life.percent);
        const tierIndex = GAUGE_ZONES.indexOf(zone);
        const tier = TIERS[tierIndex];
        const now = new Date();
        const dateText = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
        const dayNumber = Math.floor(todayUTC() / DAY_MS);
        const tip = DAILY_TIPS[dayNumber % DAILY_TIPS.length];

        let html = `<div class="reminder-top">
                <span class="reminder-date">${dateText}</span>
                <span class="tier-badge tier-${zone.key}">Level: ${tier.name}</span>
            </div>`;

        if (editingBody || !bodyProfile) {
            html += `<p class="reminder-line">Add your height, weight and body size to get a plan made for your body, refreshed every day.</p>${bodyFormHTML()}`;
        } else {
            const info = bodyInfo();
            const focusKey = WEEK_PLAN[now.getDay()];
            const focus = WORKOUTS[focusKey];
            const isRecovery = focusKey === "recovery";
            const lowImpact = info.bmi >= 30 || (info.bmi >= 27 && ["XL", "XXL"].includes(bodyProfile.size));
            const underweight = info.bmi < 18.5;

            const items = [0, 1, 2, 3].map((i) => {
                const ex = focus.pool[(dayNumber + i) % focus.pool.length];
                const name = lowImpact && ex.low ? ex.low : ex.n;
                const val = ex.v[tierIndex];
                let amount;
                if (ex.u === "min") amount = `${val} min`;
                else if (isRecovery) amount = `${val} ${ex.u === "sec" ? "sec" : "reps"}`;
                else amount = `${tier.rounds} × ${val}${ex.u === "sec" ? " sec" : " reps"}`;
                return `<li><span>${name}</span><b>${amount}</b></li>`;
            }).join("");

            let water = bodyProfile.weight * 0.035 + (isRecovery ? 0 : 0.3);
            water = Math.max(1.5, Math.min(4.5, water));
            const steps = underweight ? Math.min(tier.steps, 8000) : tier.steps;

            let note = "";
            if (lowImpact) note = "Joint-friendly version: no jumping moves today. ";
            if (underweight) note += "Focus on strength and recovery, keep cardio light, and eat regular meals with enough protein. ";

            html += `<p class="reminder-line"><strong class="zone-text-${zone.key}">${tier.name} level.</strong> ${LEVEL_MSG[tierIndex]}</p>
                <div class="reminder-tiles">
                    <div class="r-tile"><span>💧</span><strong>${water.toFixed(1)} L</strong><small>Water</small></div>
                    <div class="r-tile"><span>👟</span><strong>${steps.toLocaleString("en-US")}</strong><small>Steps</small></div>
                    <div class="r-tile"><span>😴</span><strong>7–9 h</strong><small>Sleep</small></div>
                    <div class="r-tile"><span>⚖️</span><strong>${info.bmi.toFixed(1)}</strong><small>BMI · ${info.label}</small></div>
                </div>
                <div class="reminder-work">
                    <h3>Today: ${focus.title}</h3>
                    <ul class="reminder-list tier-border-${zone.key}">${items}</ul>
                    <small class="reminder-note">${isRecovery ? "Go easy today, this is recovery." : `5 min warm-up first · rest ${tier.rest} s between rounds.`}</small>
                </div>`;
            if (note) html += `<p class="reminder-note">${note.trim()}</p>`;
        }

        html += `<div class="reminder-tip">💡 ${tip}</div>
            <p class="reminder-note">Level follows your all-time progress since your first tick. General wellness guide, not medical advice.</p>`;

        dailyReminder.innerHTML = html;
        wireBodyForm();
    }

    function renderGoalAnalysis(percent, life) {
        goalAnalysis.innerHTML = "";
        goalAnalysis.classList.add("rings-row");

        const zone = getGaugeZone(life.percent);
        const target = computeDailyTarget(life);
        const hit = target.goal > 0 && life.todayDone >= target.goal;
        const targetSub = !target.goal
            ? "Add a habit first"
            : hit
                ? "Target hit today! ✅"
                : `${life.todayDone}/${target.goal} habits done today`;

        [
            ["Daily Target", target.pct, `var(--zone-${zone.key})`, targetSub, hit],
            ["Discipline Score", percent, "var(--accent)", "", false],
            ["7-Day Consistency", life.recent, "var(--tertiary)", "", false]
        ].forEach(([label, value, color, sub, done]) => {
            const item = document.createElement("div");
            item.className = "ring-card";
            item.innerHTML = `${ringSVG(value, { size: 76, stroke: 7, color })}<strong>${label}</strong>${sub ? `<p class="${done ? "hit" : ""}">${sub}</p>` : ""}`;
            goalAnalysis.appendChild(item);
        });
        animateRings(goalAnalysis);
    }

    // Per-month completion for the selected year (same maths as the monthly gauge).
    /* ======================================================================
       LifeTrack v2 additions: helpers, charts, goals, fitness, profile menu
       ====================================================================== */

    const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const PALETTE = ["#4da6ff", "#22d3ee", "#a78bfa", "#f472b6", "#fbbf24", "#34d399", "#fb7185", "#60a5fa"];
    const HEALTH_SCOPES = [
        "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
        "https://www.googleapis.com/auth/googlehealth.sleep.readonly"
    ].join(" ");

    let goals = JSON.parse(store.get("goals") || "null") || [
        { id: "g-all", name: "Monthly consistency", habit: "*", target: 80 }
    ];
    let fitness = JSON.parse(store.get("fitness") || "{}");
    let analyticsView = "month";
    let ctx = null;
    let fitStatus = { text: "", kind: "" };
    let syncing = false;

    function esc(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const fmtNum = (n) => Math.round(n).toLocaleString("en-US");
    const shortName = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

    function habitColor(habit) {
        const i = habits.indexOf(habit);
        return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
    }

    function saveGoals() { store.set("goals", JSON.stringify(goals)); }
    function saveFit() { store.set("fitness", JSON.stringify(fitness)); }

    function toast(message) {
        const el = document.getElementById("toast");
        el.textContent = message;
        el.classList.add("show");
        clearTimeout(toast.t);
        toast.t = setTimeout(() => el.classList.remove("show"), 3200);
    }

    /* ---------- date + tick helpers ---------- */

    function selYM() { return { y: Number(yearSelect.value), m: monthSelect.selectedIndex }; }
    function daysIn(y, m) { return new Date(y, m + 1, 0).getDate(); }

    // days of that month that have started (0 = future month, full length = past month)
    function elapsedDays(y, m) {
        const t0 = todayUTC();
        const s = Date.UTC(y, m, 1);
        if (s > t0) return 0;
        return Math.min(daysIn(y, m), Math.round((t0 - s) / DAY_MS) + 1);
    }

    function dayCount(ms) {
        let n = 0;
        habits.forEach((h) => { if (checks[keyFor(ms, h)]) n += 1; });
        return n;
    }

    function habitTicksInMonth(habit, y, m) {
        const s = Date.UTC(y, m, 1);
        let c = 0;
        for (let d = 0; d < daysIn(y, m); d += 1) if (checks[keyFor(s + d * DAY_MS, habit)]) c += 1;
        return c;
    }

    // % of the days that have passed so far (fair for a month that is still running)
    function habitPct(habit, y, m) {
        const e = elapsedDays(y, m);
        return e ? Math.round((habitTicksInMonth(habit, y, m) / e) * 100) : 0;
    }

    function streakFor(habit, first) {
        const t0 = todayUTC();
        let cur = 0;
        let t = t0;
        if (!checks[keyFor(t, habit)]) t -= DAY_MS; // today isn't over yet, don't break the streak
        while (checks[keyFor(t, habit)]) { cur += 1; t -= DAY_MS; }
        let best = 0;
        let run = 0;
        const from = first === null || first === undefined ? t0 : first;
        for (let x = from; x <= t0; x += DAY_MS) {
            if (checks[keyFor(x, habit)]) { run += 1; if (run > best) best = run; } else run = 0;
        }
        return { cur, best: Math.max(best, cur) };
    }

    function levelClass(frac) {
        if (frac <= 0) return "lvl0";
        if (frac < 0.34) return "lvl1";
        if (frac < 0.67) return "lvl2";
        if (frac < 1) return "lvl3";
        return "lvl4";
    }

    function buildContext(life) {
        const t0 = todayUTC();
        const first = life.first;
        const streaks = {};
        let bestStreak = 0;
        habits.forEach((h) => {
            streaks[h] = streakFor(h, first);
            if (streaks[h].best > bestStreak) bestStreak = streaks[h].best;
        });
        let perfectDays = 0;
        let totalTicks = 0;
        if (first !== null && habits.length) {
            for (let x = first; x <= t0; x += DAY_MS) {
                const c = dayCount(x);
                totalTicks += c;
                if (c === habits.length) perfectDays += 1;
            }
        }
        return { life, streaks, bestStreak, perfectDays, totalTicks };
    }

    /* ---------- SVG / HTML chart builders ---------- */

    function radarSVG(labels, sets, label) {
        const n = labels.length;
        if (n < 3) return `<p class="empty-note">Add at least 3 items to draw this shape.</p>`;
        const W = 380;
        const H = 300;
        const cx = W / 2;
        const cy = H / 2 + 4;
        const R = 92;
        const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const P = (i, r) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
        const f = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;

        let grid = "";
        [25, 50, 75, 100].forEach((lv) => {
            grid += `<polygon class="radar-grid" points="${labels.map((_, i) => f(P(i, (R * lv) / 100))).join(" ")}"></polygon>`;
        });
        const axes = labels.map((_, i) => {
            const p = P(i, R);
            return `<line class="radar-axis" x1="${cx}" y1="${cy}" x2="${p[0].toFixed(1)}" y2="${p[1].toFixed(1)}"></line>`;
        }).join("");

        const series = sets.map((s) => {
            const pts = s.vals.map((v, i) => P(i, (R * clamp(v, 0, 100)) / 100));
            const dots = pts.map((p, i) => `<circle class="radar-dot" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.6" fill="${s.color}"><title>${esc(labels[i])}: ${Math.round(s.vals[i])}%</title></circle>`).join("");
            return `<polygon class="radar-area" points="${pts.map(f).join(" ")}" fill="${s.color}" stroke="${s.color}"></polygon>${dots}`;
        }).join("");

        const texts = labels.map((name, i) => {
            const p = P(i, R + 14);
            const c = Math.cos(ang(i));
            const s = Math.sin(ang(i));
            const anchor = c > 0.25 ? "start" : c < -0.25 ? "end" : "middle";
            const dy = s > 0.5 ? 10 : s < -0.5 ? -3 : 4;
            const v = sets[0] ? Math.round(sets[0].vals[i]) : 0;
            return `<text class="radar-label" x="${p[0].toFixed(1)}" y="${(p[1] + dy).toFixed(1)}" text-anchor="${anchor}">${esc(shortName(name, 12))} <tspan class="radar-val">${v}%</tspan></text>`;
        }).join("");

        return `<svg class="radar-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label || "Radar chart")}">${grid}${axes}${series}${texts}</svg>`;
    }

    function donutSVG(items, centerLabel) {
        const total = items.reduce((s, it) => s + it.value, 0);
        const r = 54;
        const c = 2 * Math.PI * r;
        let acc = 0;
        let segs = "";
        if (total > 0) {
            items.forEach((it) => {
                if (!it.value) return;
                const len = (it.value / total) * c;
                segs += `<circle class="donut-seg" cx="80" cy="80" r="${r}" stroke="${it.color}" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 80 80)"><title>${esc(it.label)}: ${it.value}</title></circle>`;
                acc += len;
            });
        }
        const legend = items.map((it) => `<li><i style="background:${it.color}"></i><span>${esc(it.label)}</span><b>${it.value}</b></li>`).join("");
        return `<div class="donut-wrap">
            <svg class="donut-svg" viewBox="0 0 160 160" role="img" aria-label="${esc(centerLabel)}">
                <circle class="donut-track" cx="80" cy="80" r="${r}"></circle>${segs}
                <text class="donut-num" x="80" y="78" text-anchor="middle">${total}</text>
                <text class="donut-cap" x="80" y="96" text-anchor="middle">check-ins</text>
            </svg>
            <ul class="donut-legend">${legend}</ul>
        </div>`;
    }

    function sparkSVG(values, id, color) {
        const W = 200;
        const H = 56;
        const max = Math.max(...values, 1);
        const n = values.length;
        if (!n) return "";
        const pts = values.map((v, i) => [n > 1 ? (i * W) / (n - 1) : W / 2, H - 4 - (v / max) * (H - 10)]);
        const line = pts.map((p, i) => `${i ? "L" : "M"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
        const area = `${line} L ${pts[n - 1][0].toFixed(1)} ${H} L ${pts[0][0].toFixed(1)} ${H} Z`;
        return `<svg class="spark-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
            <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity="0.4"></stop><stop offset="100%" stop-color="${color}" stop-opacity="0"></stop></linearGradient></defs>
            <path d="${area}" fill="url(#${id})"></path>
            <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"></path>
        </svg>`;
    }

    // Daily completion bars, always fills its panel: grid, target line, value labels, empty message.
    function dailyBarsSVG(totals, days, elapsed, goal, todayIdx) {
        const W = 640;
        const H = 230;
        const L = 30;
        const Rm = 8;
        const T = 16;
        const B = 26;
        const pw = W - L - Rm;
        const ph = H - T - B;
        const slot = pw / days;
        const bw = Math.min(18, slot * 0.62);
        const ymax = Math.max(habits.length, 1);
        const step = Math.max(1, Math.ceil(ymax / 4));
        let grid = "";
        for (let v = 0; v <= ymax; v += step) {
            const y = T + ph - (v / ymax) * ph;
            grid += `<line class="cg-line" x1="${L}" y1="${y.toFixed(1)}" x2="${W - Rm}" y2="${y.toFixed(1)}"></line><text class="cg-tick" x="${L - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end">${v}</text>`;
        }
        let bars = "";
        let labels = "";
        let sum = 0;
        totals.forEach((count, i) => {
            sum += count;
            const x = L + i * slot + (slot - bw) / 2;
            const future = i >= elapsed;
            const h = future ? 0 : (count / ymax) * ph;
            const y = T + ph - Math.max(h, future ? 0 : 2);
            if (i === todayIdx) bars += `<rect class="cg-today" x="${(L + i * slot).toFixed(1)}" y="${T}" width="${slot.toFixed(1)}" height="${ph}" rx="4"></rect>`;
            const cls = future ? "cg-future" : count >= goal && count > 0 ? "cg-hit" : count > 0 ? "cg-part" : "cg-zero";
            bars += `<rect class="cg-bar ${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${(future ? 2 : Math.max(h, 2)).toFixed(1)}" rx="3"><title>${monthNames[selYM().m]} ${i + 1}: ${count} of ${habits.length} done</title></rect>`;
            if (count > 0 && !future) bars += `<text class="cg-val" x="${(x + bw / 2).toFixed(1)}" y="${(y - 3).toFixed(1)}" text-anchor="middle">${count}</text>`;
            labels += `<text class="cg-day${i === todayIdx ? " now" : ""}" x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${i + 1}</text>`;
        });
        let target = "";
        if (goal > 0) {
            const ty = T + ph - (goal / ymax) * ph;
            target = `<line class="cg-target" x1="${L}" y1="${ty.toFixed(1)}" x2="${W - Rm}" y2="${ty.toFixed(1)}"></line>`;
        }
        const empty = sum === 0 ? `<text class="cg-empty" x="${W / 2}" y="${T + ph / 2}" text-anchor="middle">Tick a habit and your bars show up here</text>` : "";
        return `<svg class="cg-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Habits completed per day">${grid}${target}${bars}${labels}${empty}</svg>`;
    }

    function lineChart2(values, ymax, elapsed) {
        const W = 960;
        const H = 260;
        const L = 32;
        const Rm = 12;
        const T = 14;
        const B = 28;
        const pw = W - L - Rm;
        const ph = H - T - B;
        const n = values.length;
        const X = (i) => L + (n > 1 ? (i * pw) / (n - 1) : pw / 2);
        const Y = (v) => T + ph - (clamp(v, 0, ymax) / ymax) * ph;
        const step = Math.max(1, Math.ceil(ymax / 4));
        let grid = "";
        for (let v = 0; v <= ymax; v += step) {
            grid += `<line class="cg-line" x1="${L}" y1="${Y(v).toFixed(1)}" x2="${W - Rm}" y2="${Y(v).toFixed(1)}"></line><text class="cg-tick" x="${L - 6}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end">${v}</text>`;
        }
        let xl = "";
        for (let i = 0; i < n; i += 1) {
            if (i === 0 || (i + 1) % 5 === 0 || i === n - 1) xl += `<text class="cg-day" x="${X(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${i + 1}</text>`;
        }
        if (!elapsed) return `<svg class="line-chart-svg" viewBox="0 0 ${W} ${H}">${grid}${xl}<text class="cg-empty" x="${W / 2}" y="${T + ph / 2}" text-anchor="middle">This month hasn't started yet</text></svg>`;

        const pts = values.slice(0, elapsed).map((v, i) => [X(i), Y(v)]);
        const line = pts.map((p, i) => `${i ? "L" : "M"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
        const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)} ${T + ph} L ${pts[0][0].toFixed(1)} ${T + ph} Z`;
        const avg = values.slice(0, elapsed).map((_, i) => {
            const from = Math.max(0, i - 6);
            const slice = values.slice(from, i + 1);
            return slice.reduce((s, x) => s + x, 0) / slice.length;
        });
        const avgLine = avg.map((v, i) => `${i ? "L" : "M"} ${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
        const dots = pts.map((p, i) => `<circle class="line-dot" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.4"><title>Day ${i + 1}: ${values[i]} of ${habits.length}</title></circle>`).join("");
        return `<svg class="line-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily completion trend">
            <defs><linearGradient id="lineFill2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--primary)" stop-opacity="0.35"></stop><stop offset="100%" stop-color="var(--primary)" stop-opacity="0"></stop></linearGradient></defs>
            ${grid}${xl}
            <path d="${area}" fill="url(#lineFill2)"></path>
            <path class="line-avg" d="${avgLine}"></path>
            <path class="line-stroke" d="${line}"></path>
            ${dots}
        </svg>
        <div class="chart-legend"><span><i class="lg-line"></i>Habits done per day</span><span><i class="lg-dash"></i>7-day average</span></div>`;
    }

    function miniBarsSVG(values, target, color, unit) {
        const W = 240;
        const H = 84;
        const n = values.length;
        const max = Math.max(target || 0, ...values, 1) * 1.08;
        const slot = W / n;
        const bw = slot * 0.66;
        let bars = "";
        values.forEach((v, i) => {
            const h = (v / max) * (H - 18);
            bars += `<rect class="mb-bar" x="${(i * slot + (slot - bw) / 2).toFixed(1)}" y="${(H - 14 - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h, v > 0 ? 2 : 1).toFixed(1)}" rx="2.5" fill="${color}" opacity="${v > 0 ? 1 : 0.25}"><title>${v}${unit}</title></rect>`;
        });
        const ty = H - 14 - (target / max) * (H - 18);
        const tl = target ? `<line class="cg-target" x1="0" y1="${ty.toFixed(1)}" x2="${W}" y2="${ty.toFixed(1)}"></line>` : "";
        return `<svg class="mb-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${tl}${bars}</svg>`;
    }

    function heatMonthHTML(y, m) {
        const days = daysIn(y, m);
        const first = new Date(y, m, 1).getDay();
        const t0 = todayUTC();
        const s = Date.UTC(y, m, 1);
        let html = `<div class="heat-month">${DOW.map((d) => `<span class="heat-dow">${d[0]}</span>`).join("")}`;
        for (let i = 0; i < first; i += 1) html += `<span class="heat-cell blank"></span>`;
        for (let d = 1; d <= days; d += 1) {
            const ms = s + (d - 1) * DAY_MS;
            const future = ms > t0;
            const c = future ? 0 : dayCount(ms);
            const frac = habits.length ? c / habits.length : 0;
            html += `<span class="heat-cell ${future ? "future" : levelClass(frac)}${ms === t0 ? " today" : ""}" title="${d} ${monthNames[m]}: ${future ? "upcoming" : `${c} of ${habits.length}`}">${d}</span>`;
        }
        return `${html}</div><div class="heat-legend"><span>Less</span><i class="heat-cell lvl0"></i><i class="heat-cell lvl1"></i><i class="heat-cell lvl2"></i><i class="heat-cell lvl3"></i><i class="heat-cell lvl4"></i><span>More</span></div>`;
    }

    function heatYearSVG(y) {
        const cell = 12;
        const gap = 3;
        const stride = cell + gap;
        const left = 26;
        const top = 18;
        const t0 = todayUTC();
        const jan1 = Date.UTC(y, 0, 1);
        const offset = new Date(y, 0, 1).getDay();
        const total = Math.round((Date.UTC(y + 1, 0, 1) - jan1) / DAY_MS);
        let rects = "";
        const monthX = {};
        for (let i = 0; i < total; i += 1) {
            const ms = jan1 + i * DAY_MS;
            const col = Math.floor((i + offset) / 7);
            const row = (i + offset) % 7;
            const d = new Date(ms);
            if (d.getUTCDate() === 1) monthX[d.getUTCMonth()] = col;
            const future = ms > t0;
            const c = future ? 0 : dayCount(ms);
            const frac = habits.length ? c / habits.length : 0;
            rects += `<rect class="heat-rect ${future ? "future" : levelClass(frac)}" x="${left + col * stride}" y="${top + row * stride}" width="${cell}" height="${cell}" rx="3"><title>${fmtDate(ms)}: ${future ? "upcoming" : `${c} of ${habits.length}`}</title></rect>`;
        }
        const cols = Math.ceil((total + offset) / 7);
        const labels = Object.keys(monthX).map((mm) => `<text class="cg-day" x="${left + monthX[mm] * stride}" y="11">${monthNames[mm].slice(0, 3)}</text>`).join("");
        const dl = [1, 3, 5].map((r) => `<text class="cg-day" x="0" y="${top + r * stride + 10}">${DOW[r]}</text>`).join("");
        const W = left + cols * stride;
        const H = top + 7 * stride;
        return `<svg class="heat-year-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Every day of ${y}">${labels}${dl}${rects}</svg>`;
    }

    function matrixHTML(rowLabels, rows, colorFor) {
        let html = `<table class="matrix"><thead><tr><th></th>${monthNames.map((n) => `<th>${n.slice(0, 1)}</th>`).join("")}</tr></thead><tbody>`;
        rows.forEach((cells, r) => {
            html += `<tr><th>${rowLabels[r]}</th>${cells.map((v, i) => `<td><span class="mx ${v === null ? "future" : levelClass(v / 100)}" title="${monthNames[i]}: ${v === null ? "no data" : `${v}%`}">${v === null ? "" : v}</span></td>`).join("")}</tr>`;
        });
        return `${html}</tbody></table>`;
    }

    /* ---------- goals maths ---------- */

    function goalStats(goal, y, m) {
        const days = daysIn(y, m);
        const elapsed = elapsedDays(y, m);
        let ticks = 0;
        let possible = 0;
        if (goal.habit === "*") {
            habits.forEach((h) => { ticks += habitTicksInMonth(h, y, m); });
            possible = habits.length * days;
        } else if (habits.includes(goal.habit)) {
            ticks = habitTicksInMonth(goal.habit, y, m);
            possible = days;
        }
        const actual = possible ? (ticks / possible) * 100 : 0;
        const ratio = goal.target ? clamp((actual / goal.target) * 100, 0, 100) : 0;
        const needTicks = Math.ceil((goal.target / 100) * possible);
        const remainingTicks = Math.max(0, needTicks - ticks);
        const perDay = goal.habit === "*" ? habits.length : 1;
        const daysLeft = Math.max(0, days - elapsed);
        const reachable = remainingTicks <= daysLeft * perDay + (elapsed ? perDay : 0);
        const pace = days ? (goal.target * elapsed) / days : 0;
        return { ticks, possible, actual, ratio, remainingTicks, daysLeft, reachable, onTrack: actual >= pace * 0.9, elapsed, missing: goal.habit !== "*" && !habits.includes(goal.habit) };
    }

    /* ---------- dashboard renders ---------- */

    function renderHabitLegend() {
        const el = document.getElementById("habitLegend");
        const { y, m } = selYM();
        if (!habits.length) { el.innerHTML = `<p class="empty-note">No habits yet. Add one in the Habits tab.</p>`; return; }
        const rows = habits.slice(0, 6).map((h) => {
            const p = habitPct(h, y, m);
            const c = habitColor(h);
            return `<div class="hl-row" title="${esc(h)}: ${p}% of days so far"><i style="background:${c}"></i><span>${esc(h)}</span><div class="hl-bar"><b style="width:${p}%;background:${c}"></b></div><em>${p}%</em></div>`;
        }).join("");
        el.innerHTML = rows + (habits.length > 6 ? `<small class="hl-more">+${habits.length - 6} more in the Habits tab</small>` : "");
    }

    function renderCompletedCard(dailyTotals) {
        const spark = document.getElementById("completedSpark");
        const chips = document.getElementById("completedChips");
        const { y, m } = selYM();
        const elapsed = elapsedDays(y, m);
        spark.innerHTML = sparkSVG(dailyTotals.slice(0, Math.max(elapsed, 1)), "sparkFill", "var(--accent)");
        const t0 = todayUTC();
        const n = habits.length;
        const last7 = [];
        for (let i = 6; i >= 0; i -= 1) last7.push(dayCount(t0 - i * DAY_MS));
        const avg7 = n ? Math.round((last7.reduce((s, x) => s + x, 0) / (7 * n)) * 100) : 0;
        let perfect = 0;
        const s = Date.UTC(y, m, 1);
        for (let d = 0; d < elapsed; d += 1) if (n && dayCount(s + d * DAY_MS) === n) perfect += 1;
        chips.innerHTML = `<span class="chip">Today <b>${ctx.life.todayDone}/${n}</b></span><span class="chip">7-day avg <b>${avg7}%</b></span><span class="chip">Perfect days <b>${perfect}</b></span>`;
    }

    function renderWeekStrip() {
        const el = document.getElementById("weekStrip");
        const t0 = todayUTC();
        const n = habits.length;
        let html = `<h3 class="sub-head">Last 7 days</h3><div class="week-dots">`;
        for (let i = 6; i >= 0; i -= 1) {
            const ms = t0 - i * DAY_MS;
            const c = dayCount(ms);
            const p = n ? Math.round((c / n) * 100) : 0;
            html += `<div class="wk${i === 0 ? " now" : ""}" title="${fmtDate(ms)}: ${c} of ${n}"><span class="wk-dot" style="--p:${p}">${c}</span><small>${DOW[new Date(ms).getUTCDay()][0]}</small></div>`;
        }
        el.innerHTML = `${html}</div>`;
    }

    function renderDailyChart(dailyTotals) {
        const { y, m } = selYM();
        const days = dailyTotals.length;
        const elapsed = elapsedDays(y, m);
        const t0 = todayUTC();
        const todayIdx = Date.UTC(y, m, 1) <= t0 && t0 <= Date.UTC(y, m, days) ? Math.round((t0 - Date.UTC(y, m, 1)) / DAY_MS) : -1;
        const goal = computeDailyTarget(ctx.life).goal;
        completionChart.innerHTML = dailyBarsSVG(dailyTotals, days, elapsed, goal, todayIdx);

        const n = habits.length;
        let best = { c: -1, d: 0 };
        let perfect = 0;
        let onTarget = 0;
        let sum = 0;
        for (let i = 0; i < elapsed; i += 1) {
            const c = dailyTotals[i];
            sum += c;
            if (c > best.c) best = { c, d: i + 1 };
            if (n && c === n) perfect += 1;
            if (goal && c >= goal) onTarget += 1;
        }
        document.getElementById("completionChips").innerHTML = elapsed
            ? `<span class="chip">Best day <b>${best.d} ${monthNames[m].slice(0, 3)} (${best.c}/${n})</b></span><span class="chip">Avg <b>${(sum / elapsed).toFixed(1)}/day</b></span><span class="chip">On target <b>${onTarget} days</b></span><span class="chip">Perfect <b>${perfect}</b></span><span class="chip"><i class="tgt-line"></i>Daily target <b>${goal}</b></span>`
            : `<span class="chip">This month hasn't started yet</span>`;

        // average by weekday
        const totalsByDow = Array(7).fill(0);
        const countsByDow = Array(7).fill(0);
        const s = Date.UTC(y, m, 1);
        for (let i = 0; i < elapsed; i += 1) {
            const dw = new Date(s + i * DAY_MS).getUTCDay();
            totalsByDow[dw] += dailyTotals[i];
            countsByDow[dw] += 1;
        }
        const order = [1, 2, 3, 4, 5, 6, 0];
        document.getElementById("weekdayBars").innerHTML = order.map((dw) => {
            const p = n && countsByDow[dw] ? Math.round((totalsByDow[dw] / (countsByDow[dw] * n)) * 100) : 0;
            const zone = getGaugeZone(p);
            return `<div class="wd-row"><span>${DOW[dw]}</span><div class="wd-track"><b class="zone-bg-${zone.key}" style="width:${p}%"></b></div><em>${countsByDow[dw] ? `${p}%` : "–"}</em></div>`;
        }).join("");
    }

    function renderRadarsAndStreaks() {
        const { y, m } = selYM();
        const labels = habits.slice();
        const vals = habits.map((h) => habitPct(h, y, m));
        const set = [{ vals, color: "var(--primary)" }];
        document.getElementById("habitRadar").innerHTML = radarSVG(labels, set, "Habit balance this month");
        document.getElementById("habitRadar2").innerHTML = radarSVG(labels, set, "Habit shape this month");

        // life balance, last 7 days
        const t0 = todayUTC();
        const tg = dailyTargets(ctx.life);
        const n = habits.length;
        const days = [];
        for (let i = 0; i < 7; i += 1) days.push(t0 - i * DAY_MS);
        const habitAvg = n ? (days.reduce((s, ms) => s + dayCount(ms), 0) / (7 * n)) * 100 : 0;
        const avgOf = (field, target) => {
            const logged = days.map((ms) => (fitness[isoFromUTC(ms)] || {})[field]).filter((v) => typeof v === "number" && v > 0);
            return logged.length ? clamp((logged.reduce((s, x) => s + x, 0) / logged.length / target) * 100, 0, 100) : 0;
        };
        const moods = days.map((ms) => (fitness[isoFromUTC(ms)] || {}).mood).filter(Boolean);
        const axes = [
            ["Habits", habitAvg],
            ["Steps", avgOf("steps", tg.steps)],
            ["Water", avgOf("water", tg.water)],
            ["Sleep", avgOf("sleep", tg.sleep)],
            ["Active", avgOf("active", tg.active)],
            ["Mood", moods.length ? (moods.reduce((s, x) => s + x, 0) / moods.length / 5) * 100 : 0]
        ];
        document.getElementById("lifeRadar").innerHTML = radarSVG(axes.map((a) => a[0]), [{ vals: axes.map((a) => a[1]), color: "var(--accent)" }], "Life balance, last 7 days");
        document.getElementById("lifeLegend").innerHTML = axes.every((a) => a[0] === "Habits" || a[1] === 0)
            ? `<p class="empty-note">Log steps, water, sleep and mood in Fitness Today to fill the other corners.</p>` : "";

        // streaks
        const list = document.getElementById("streakList");
        if (!habits.length) { list.innerHTML = `<p class="empty-note">No habits yet.</p>`; return; }
        const maxBest = Math.max(...habits.map((h) => ctx.streaks[h].best), 7);
        list.innerHTML = habits.map((h) => {
            const s = ctx.streaks[h];
            return `<div class="streak-row"><div class="streak-top"><span><i style="background:${habitColor(h)}"></i>${esc(h)}</span><b>${s.cur > 0 ? "🔥 " : ""}${s.cur} day${s.cur === 1 ? "" : "s"}</b></div>
                <div class="streak-track" title="Current ${s.cur}, best ${s.best}"><b style="width:${(s.cur / maxBest) * 100}%;background:${habitColor(h)}"></b><u style="left:${(s.best / maxBest) * 100}%"></u></div>
                <small>Best: ${s.best} day${s.best === 1 ? "" : "s"}</small></div>`;
        }).join("");
    }

    function renderBadges() {
        const c = ctx;
        let best10k = 0;
        let bestSleep = 0;
        let bestWater = 0;
        Object.keys(fitness).forEach((k) => {
            const f = fitness[k];
            if (f.steps > best10k) best10k = f.steps;
            if (f.sleep > bestSleep) bestSleep = f.sleep;
            if (f.water > bestWater) bestWater = f.water;
        });
        const list = [
            { icon: "🌱", name: "First step", desc: "Tick your first habit", cur: c.totalTicks, goal: 1 },
            { icon: "🔥", name: "7-day streak", desc: "Keep one habit going for a week", cur: c.bestStreak, goal: 7 },
            { icon: "⚡", name: "30-day streak", desc: "One habit, thirty days in a row", cur: c.bestStreak, goal: 30 },
            { icon: "✨", name: "Perfect day", desc: "Finish every habit in one day", cur: c.perfectDays, goal: 1 },
            { icon: "🏅", name: "5 perfect days", desc: "Finish everything on five days", cur: c.perfectDays, goal: 5 },
            { icon: "💯", name: "100 check-ins", desc: "One hundred ticks, all time", cur: c.totalTicks, goal: 100 },
            { icon: "🏆", name: "500 check-ins", desc: "Five hundred ticks, all time", cur: c.totalTicks, goal: 500 },
            { icon: "👟", name: "10k steps", desc: "A day with 10,000 steps", cur: best10k, goal: 10000 },
            { icon: "😴", name: "Full rest", desc: "Sleep 8 hours or more", cur: bestSleep, goal: 8 },
            { icon: "💧", name: "Hydrated", desc: "Drink 2.5 L in a day", cur: bestWater, goal: 2500 }
        ];
        document.getElementById("badgeGrid").innerHTML = list.map((b) => {
            const done = b.cur >= b.goal;
            const p = clamp((b.cur / b.goal) * 100, 0, 100);
            return `<div class="badge${done ? " done" : ""}" title="${esc(b.desc)}"><span class="badge-ico">${b.icon}</span><strong>${b.name}</strong><small>${done ? "Unlocked" : esc(b.desc)}</small><div class="badge-bar"><b style="width:${p}%"></b></div></div>`;
        }).join("");
    }

    /* ---------- habits page ---------- */

    function renderManageList() {
        const { y, m } = selYM();
        const t0 = todayUTC();
        if (!habits.length) {
            habitManageList.innerHTML = `<p class="empty-note">Nothing here yet. Type a habit above and press Add Habit.</p>`;
            document.getElementById("habitDonut").innerHTML = donutSVG([], "No check-ins yet");
            return;
        }
        habitManageList.innerHTML = habits.map((h, idx) => {
            const p = habitPct(h, y, m);
            const s = ctx.streaks[h];
            const ticks = habitTicksInMonth(h, y, m);
            let strip = "";
            for (let i = 29; i >= 0; i -= 1) {
                const ms = t0 - i * DAY_MS;
                strip += `<i class="${checks[keyFor(ms, h)] ? "on" : ""}" style="${checks[keyFor(ms, h)] ? `background:${habitColor(h)}` : ""}" title="${fmtDate(ms)}"></i>`;
            }
            const months = [];
            for (let mm = 0; mm < 12; mm += 1) {
                const e = elapsedDays(y, mm);
                months.push(e ? Math.round((habitTicksInMonth(h, y, mm) / daysIn(y, mm)) * 100) : 0);
            }
            return `<article class="habit-card">
                <header><span class="hc-name"><i style="background:${habitColor(h)}"></i>${esc(h)}</span><button type="button" class="delete-btn" data-remove="${idx}" aria-label="Remove ${esc(h)}">Remove</button></header>
                <div class="hc-main">
                    ${ringSVG(p, { size: 72, stroke: 7, color: habitColor(h) })}
                    <ul class="hc-stats">
                        <li><b>${s.cur}</b><span>day streak</span></li>
                        <li><b>${s.best}</b><span>best streak</span></li>
                        <li><b>${ticks}</b><span>this month</span></li>
                    </ul>
                </div>
                <div class="hc-strip" aria-label="Last 30 days">${strip}</div>
                <div class="hc-year" title="Month by month, ${y}">${miniBarsSVG(months, 0, habitColor(h), "%")}<small>${y} by month</small></div>
            </article>`;
        }).join("");
        animateRings(habitManageList);

        const items = habits.map((h) => ({ label: h, value: habitTicksInMonth(h, y, m), color: habitColor(h) }));
        document.getElementById("habitDonut").innerHTML = donutSVG(items, "Check-ins by habit this month");
    }

    /* ---------- goals page ---------- */

    function fillGoalHabitSelect() {
        const sel = document.getElementById("goalHabit");
        const keep = sel.value;
        sel.innerHTML = `<option value="*">All habits together</option>${habits.map((h) => `<option value="${esc(h)}">${esc(h)}</option>`).join("")}`;
        if (keep) sel.value = keep;
    }

    function renderGoalsPage() {
        const { y, m } = selYM();
        fillGoalHabitSelect();
        const grid = document.getElementById("goalPageList");
        if (!goals.length) {
            grid.innerHTML = `<p class="empty-note">No goals yet. Name one above, choose a habit and a target.</p>`;
        } else {
            grid.innerHTML = goals.map((g) => {
                const st = goalStats(g, y, m);
                const color = g.habit === "*" ? "var(--primary)" : habitColor(g.habit);
                let status;
                if (st.missing) status = `<span class="chip warn">Habit removed</span>`;
                else if (st.ratio >= 100) status = `<span class="chip good">Goal reached 🎉</span>`;
                else if (!st.elapsed) status = `<span class="chip">Starts soon</span>`;
                else if (!st.reachable) status = `<span class="chip bad">Out of reach this month</span>`;
                else if (st.onTrack) status = `<span class="chip good">On track</span>`;
                else status = `<span class="chip warn">Behind pace</span>`;
                const months = [];
                for (let mm = 0; mm < 12; mm += 1) months.push(elapsedDays(y, mm) ? Math.round(goalStats(g, y, mm).ratio) : 0);
                return `<article class="goal-card">
                    <header><span class="hc-name">${esc(g.name)}</span><button type="button" class="delete-btn" data-goal-remove="${esc(g.id)}" aria-label="Remove goal ${esc(g.name)}">Remove</button></header>
                    <div class="hc-main">
                        ${ringSVG(st.ratio, { size: 92, stroke: 9, color })}
                        <div class="goal-meta">
                            <span class="chip">${g.habit === "*" ? "All habits" : esc(g.habit)}</span>
                            <p>${Math.round(st.actual)}% of the month done, target ${g.target}%</p>
                            ${status}
                        </div>
                    </div>
                    ${st.ratio < 100 && !st.missing ? `<small class="goal-need">${st.remainingTicks} more check-in${st.remainingTicks === 1 ? "" : "s"} needed · ${st.daysLeft} day${st.daysLeft === 1 ? "" : "s"} left</small>` : ""}
                    <div class="hc-year">${miniBarsSVG(months, 100, color, "%")}<small>${y} by month, % of target</small></div>
                </article>`;
            }).join("");
            animateRings(grid);
        }

        const labels = goals.map((g) => g.name);
        const vals = goals.map((g) => goalStats(g, y, m).ratio);
        document.getElementById("goalRadar").innerHTML = radarSVG(labels, [{ vals, color: "var(--accent)" }], "Goal progress radar");

        const rows = goals.map((g) => {
            const row = [];
            for (let mm = 0; mm < 12; mm += 1) row.push(Date.UTC(y, mm, 1) > todayUTC() || ctx.life.first === null || Date.UTC(y, mm, daysIn(y, mm)) < ctx.life.first ? null : Math.round(goalStats(g, y, mm).ratio));
            return row;
        });
        document.getElementById("goalYear").innerHTML = goals.length ? `<div class="scroll-x">${matrixHTML(goals.map((g) => esc(shortName(g.name, 16))), rows)}</div><p class="empty-note">Each cell is % of that month's target.</p>` : `<p class="empty-note">Add a goal to see it month by month.</p>`;
    }

    /* ---------- analytics ---------- */

    function kpi(label, value, sub) {
        return `<div class="kpi"><small>${label}</small><b>${value}</b>${sub ? `<span>${sub}</span>` : ""}</div>`;
    }

    function renderAnalytics(percent, completed, total, dailyTotals) {
        const { y, m } = selYM();
        const elapsed = elapsedDays(y, m);
        const n = habits.length;
        let perfect = 0;
        let active = 0;
        const s = Date.UTC(y, m, 1);
        for (let i = 0; i < elapsed; i += 1) {
            if (dailyTotals[i] > 0) active += 1;
            if (n && dailyTotals[i] === n) perfect += 1;
        }
        document.getElementById("anKpis").innerHTML =
            kpi("Completion", `${percent}%`, `${monthNames[m]} ${y}`) +
            kpi("Check-ins", `${completed}<em> / ${total}</em>`, "this month") +
            kpi("Perfect days", perfect, `${active} active days`) +
            kpi("Best streak", `${ctx.bestStreak}<em> days</em>`, "any habit, all time") +
            kpi("Since first tick", ctx.life.first === null ? "–" : `${ctx.life.percent}%`, ctx.life.first === null ? "start ticking" : fmtDate(ctx.life.first));
        document.getElementById("analyticsChart").innerHTML = lineChart2(dailyTotals, Math.max(n, 1), elapsed);
        document.getElementById("heatMonth").innerHTML = heatMonthHTML(y, m);
        document.getElementById("anRadar").innerHTML = radarSVG(habits.slice(), [{ vals: habits.map((h) => habitPct(h, y, m)), color: "var(--primary)" }], "Habit balance this month");

        // fitness last 14 days
        const t0 = todayUTC();
        const tg = dailyTargets(ctx.life);
        const series = (field, div) => { const a = []; for (let i = 13; i >= 0; i -= 1) a.push(Math.round((((fitness[isoFromUTC(t0 - i * DAY_MS)] || {})[field]) || 0) / div * 10) / 10); return a; };
        const card = (title, values, target, color, unit, fmt) => {
            const logged = values.filter((v) => v > 0);
            const avg = logged.length ? logged.reduce((a, b) => a + b, 0) / logged.length : 0;
            return `<div class="box-soft trend-card"><div class="trend-top"><strong>${title}</strong><span>${logged.length ? `avg ${fmt(avg)}${unit}` : "no data yet"}</span></div>${miniBarsSVG(values, target, color, unit)}</div>`;
        };
        document.getElementById("fitTrend").innerHTML =
            card("Steps", series("steps", 1), tg.steps, "var(--primary)", "", fmtNum) +
            card("Water (L)", series("water", 1000), tg.water / 1000, "var(--accent)", " L", (v) => v.toFixed(1)) +
            card("Sleep (h)", series("sleep", 1), tg.sleep, "#a78bfa", " h", (v) => v.toFixed(1));

        renderYearly(s);
    }

    function renderYearly() {
        const { y } = selYM();
        const t0 = todayUTC();
        const n = habits.length;
        let yearTicks = 0;
        let yearPossible = 0;
        let best = null;
        let tracked = 0;
        const months = [];
        const matrix = habits.map(() => []);
        for (let m = 0; m < 12; m += 1) {
            const monthStart = Date.UTC(y, m, 1);
            const days = daysIn(y, m);
            const started = monthStart <= t0;
            let ticks = 0;
            habits.forEach((h, hi) => {
                const c = started ? habitTicksInMonth(h, y, m) : 0;
                ticks += c;
                matrix[hi].push(started && ctx.life.first !== null && Date.UTC(y, m, days) >= ctx.life.first ? Math.round((c / (elapsedDays(y, m) || 1)) * 100) : null);
            });
            const possible = n * days;
            const inRange = started && ctx.life.first !== null && Date.UTC(y, m, days) >= ctx.life.first;
            const pct = inRange && possible ? Math.round((ticks / possible) * 100) : null;
            if (pct !== null) {
                yearTicks += ticks; yearPossible += possible; tracked += 1;
                if (!best || pct > best.pct) best = { pct, month: monthNames[m] };
            }
            months.push({ pct, ticks, possible, m, current: monthStart <= t0 && Date.UTC(y, m, days) >= t0 });
        }

        document.getElementById("yearlyChart").innerHTML = `<div class="year-scroll"><div class="year-chart">${months.map((o) => {
            const zone = o.pct === null ? null : getGaugeZone(o.pct);
            return `<div class="year-col${o.pct === null ? " empty" : ""}${o.current ? " current" : ""}" title="${o.pct === null ? `${monthNames[o.m]} ${y}: no data` : `${monthNames[o.m]} ${y}: ${o.ticks} of ${o.possible} check-ins (${o.pct}%)`}">
                <span class="year-val">${o.pct === null ? "–" : `${o.pct}%`}</span>
                <div class="year-track"><span class="year-bar ${zone ? `zone-bg-${zone.key}` : ""}" data-h="${o.pct === null ? 0 : Math.max(o.pct, 3)}"></span></div>
                <span class="year-mon">${monthNames[o.m].slice(0, 3)}</span></div>`;
        }).join("")}</div></div>`;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            document.querySelectorAll("#yearlyChart .year-bar[data-h]").forEach((bar) => { bar.style.height = `${bar.dataset.h}%`; });
        }));

        // year kpis
        let perfect = 0;
        let ticksToDate = 0;
        const jan1 = Date.UTC(y, 0, 1);
        const end = Math.min(t0, Date.UTC(y, 11, 31));
        if (jan1 <= t0 && n) {
            for (let x = jan1; x <= end; x += DAY_MS) { const c = dayCount(x); ticksToDate += c; if (c === n) perfect += 1; }
        }
        document.getElementById("anYearKpis").innerHTML =
            kpi(`${y} overall`, tracked ? `${yearPossible ? Math.round((yearTicks / yearPossible) * 100) : 0}%` : "–", tracked ? `${tracked} month${tracked === 1 ? "" : "s"} tracked` : "no data yet") +
            kpi("Check-ins", fmtNum(ticksToDate), `in ${y}`) +
            kpi("Best month", best ? best.month.slice(0, 3) : "–", best ? `${best.pct}%` : "") +
            kpi("Perfect days", perfect, `in ${y}`) +
            kpi("Longest streak", `${ctx.bestStreak}<em> days</em>`, "all time");

        document.getElementById("heatYear").innerHTML = heatYearSVG(y) + `<div class="heat-legend"><span>Less</span><i class="heat-cell lvl0"></i><i class="heat-cell lvl1"></i><i class="heat-cell lvl2"></i><i class="heat-cell lvl3"></i><i class="heat-cell lvl4"></i><span>More</span></div>`;
        document.getElementById("yearMatrix").innerHTML = habits.length ? matrixHTML(habits.map((h) => esc(shortName(h, 14))), matrix) : `<p class="empty-note">Add habits to see this grid.</p>`;

        const radarFrom = ctx.life.first === null ? jan1 : Math.max(jan1, ctx.life.first);
        const yearDays = radarFrom <= end ? Math.round((end - radarFrom) / DAY_MS) + 1 : 0;
        const yv = habits.map((h) => {
            if (!yearDays) return 0;
            let c = 0;
            for (let x = radarFrom; x <= end; x += DAY_MS) if (checks[keyFor(x, h)]) c += 1;
            return Math.round((c / yearDays) * 100);
        });
        document.getElementById("yearRadar").innerHTML = radarSVG(habits.slice(), [{ vals: yv, color: "var(--accent)" }], `Habit balance ${y}`) + `<p class="empty-note">Counted from your first tick in ${y}.</p>`;
    }

    /* ---------- fitness: manual log + Google Health ---------- */

    const pad2 = (n) => String(n).padStart(2, "0");

    function dailyTargets(life) {
        const tier = TIERS[GAUGE_ZONES.indexOf(getGaugeZone(life.percent))];
        const isRecovery = WEEK_PLAN[new Date().getDay()] === "recovery";
        let steps = tier.steps;
        let water = 2500;
        if (bodyProfile) {
            water = clamp(bodyProfile.weight * 0.035 + (isRecovery ? 0 : 0.3), 1.5, 4.5) * 1000;
            if (bodyInfo().bmi < 18.5) steps = Math.min(steps, 8000);
        }
        return { steps, water: Math.round(water / 50) * 50, sleep: 8, active: 30 };
    }

    function googleToken() {
        if (!HEALTH_ON) return null;
        try {
            const t = JSON.parse(sessionStorage.getItem("lifetrack-gtoken") || "null");
            if (t && t.token && t.exp > Date.now()) return t.token;
        } catch (e) { /* ignore */ }
        return null;
    }

    function setFitStatus(text, kind) {
        fitStatus = { text, kind: kind || "" };
        const el = document.getElementById("fitStatus");
        if (el) { el.textContent = text; el.className = `fit-status ${kind || ""}`; }
    }

    function renderFitness() {
        const box = document.getElementById("fitBody");
        const acts = document.getElementById("fitActions");
        const iso = isoFromUTC(todayUTC());
        const f = fitness[iso] || {};
        const tg = dailyTargets(ctx.life);
        const linked = Boolean(googleToken());

        acts.innerHTML = !HEALTH_ON ? ""
            : linked
            ? `<span class="chip good">● Live from Google</span><button type="button" class="secondary-button" id="gSync">Sync now</button>`
            : `<button type="button" class="secondary-button" id="gConnect">Connect Google Health</button>`;

        const src = (k) => (f[`src_${k}`] === "google" ? `<small class="src">from Google</small>` : "");
        const tile = (key, label, value, goal, color, text, control) => {
            const p = goal ? clamp((value / goal) * 100, 0, 100) : 0;
            return `<div class="fit-tile">${ringSVG(p, { size: 84, stroke: 8, color })}<strong>${label}</strong><span class="fit-val">${text}</span>${control}${src(key)}</div>`;
        };
        const moods = ["😞", "🙁", "😐", "🙂", "😄"];
        box.innerHTML = `<div class="fit-grid">
            ${tile("steps", "Steps", f.steps || 0, tg.steps, "var(--primary)", `${fmtNum(f.steps || 0)} / ${fmtNum(tg.steps)}`,
                `<input class="fit-input" type="number" min="0" max="100000" step="100" inputmode="numeric" data-field="steps" value="${f.steps || ""}" placeholder="Set steps" aria-label="Steps today">`)}
            ${tile("water", "Water", f.water || 0, tg.water, "var(--accent)", `${((f.water || 0) / 1000).toFixed(2)} / ${(tg.water / 1000).toFixed(1)} L`,
                `<div class="fit-btns"><button type="button" data-water="-250" aria-label="Remove 250 ml">−</button><button type="button" data-water="250" aria-label="Add 250 ml">+250 ml</button></div>`)}
            ${tile("sleep", "Sleep", f.sleep || 0, tg.sleep, "#a78bfa", `${(f.sleep || 0).toFixed(1)} / ${tg.sleep} h`,
                `<input class="fit-input" type="number" min="0" max="16" step="0.5" inputmode="decimal" data-field="sleep" value="${f.sleep || ""}" placeholder="Hours slept" aria-label="Hours slept">`)}
            ${tile("active", "Active", f.active || 0, tg.active, "var(--zone-orange)", `${f.active || 0} / ${tg.active} min`,
                `<input class="fit-input" type="number" min="0" max="600" step="5" inputmode="numeric" data-field="active" value="${f.active || ""}" placeholder="Minutes" aria-label="Active minutes">`)}
        </div>
        <div class="mood-row"><span>How do you feel today?</span><div>${moods.map((e, i) => `<button type="button" class="mood-btn${f.mood === i + 1 ? " on" : ""}" data-mood="${i + 1}" aria-label="Mood ${i + 1} of 5" aria-pressed="${f.mood === i + 1}">${e}</button>`).join("")}</div></div>
        <p id="fitStatus" class="fit-status ${fitStatus.kind}">${esc(fitStatus.text || (linked ? "Connected. Steps and sleep refresh every minute while this tab is open." : (HEALTH_ON ? "Log by hand, or connect Google Health for live steps and sleep." : "Log your steps, water, sleep and activity by hand.")))}</p>`;
        animateRings(box);
    }

    function setFit(field, value) {
        const iso = isoFromUTC(todayUTC());
        const f = fitness[iso] || (fitness[iso] = {});
        if (value === null || Number.isNaN(value) || value <= 0) delete f[field]; else f[field] = value;
        delete f[`src_${field}`]; // a hand-typed value replaces the Google one
        saveFit();
        renderStats();
    }

    async function gfetch(url, opts) {
        const token = googleToken();
        if (!token) throw new Error("expired");
        const res = await fetch(url, Object.assign({}, opts, {
            headers: Object.assign({ Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" }, (opts && opts.headers) || {})
        }));
        if (res.status === 401) { sessionStorage.removeItem("lifetrack-gtoken"); throw new Error("expired"); }
        if (!res.ok) {
            let detail = "";
            try { const j = await res.json(); detail = (j && j.error && (j.error.message || j.error.status)) || ""; } catch (_) { /* no body */ }
            const err = new Error(`HTTP ${res.status}${detail ? ": " + String(detail).slice(0, 150) : ""}`);
            err.status = res.status;
            throw err;
        }
        return res.json();
    }

    async function syncGoogle() {
        if (!googleToken() || syncing) return;
        syncing = true;
        setFitStatus("Syncing with Google…", "");
        const notes = [];
        try {
            const t0 = todayUTC();
            const civil = (ms) => { const d = new Date(ms); return { date: { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() } }; };
            const SOURCES = "users/me/dataSourceFamilies/all-sources";

            try {
                const steps = await gfetch("https://health.googleapis.com/v4/users/me/dataTypes/steps/dataPoints:dailyRollUp", {
                    method: "POST",
                    body: JSON.stringify({ range: { start: civil(t0 - 13 * DAY_MS), end: civil(t0 + DAY_MS) }, windowSizeDays: 1, dataSourceFamily: SOURCES })
                });
                (steps.rollupDataPoints || []).forEach((p) => {
                    const d = p.civilStartTime && p.civilStartTime.date;
                    if (!d) return;
                    const iso = `${d.year}-${pad2(d.month)}-${pad2(d.day)}`;
                    const v = Number((p.steps && p.steps.countSum) || 0);
                    const f = fitness[iso] || (fitness[iso] = {});
                    if (v > 0) { f.steps = v; f.src_steps = "google"; }
                });
            } catch (e) {
                if (e.message === "expired") throw e;
                console.error("Google steps sync failed", e);
                notes.push(e.status === 403 ? "steps not shared (403)" : `steps failed (${e.message})`);
            }

            try {
                const sinceMs = t0 - 14 * DAY_MS;
                const since = isoFromUTC(sinceMs);
                const nights = {};
                let pageToken = "";
                for (let page = 0; page < 5; page += 1) {
                    const url = `https://health.googleapis.com/v4/users/me/dataTypes/sleep/dataPoints:reconcile?dataSourceFamily=${encodeURIComponent(SOURCES)}&filter=${encodeURIComponent(`sleep.interval.civil_end_time >= "${since}"`)}${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ""}`;
                    const sleep = await gfetch(url);
                    (sleep.dataPoints || []).forEach((dp) => {
                        const s = dp.sleep;
                        if (!s || !s.interval || !s.interval.endTime || (s.metadata && s.metadata.main === false)) return;
                        const end = new Date(s.interval.endTime);
                        const iso = isoFromUTC(Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()));
                        nights[iso] = (nights[iso] || 0) + Number((s.summary && s.summary.minutesAsleep) || 0);
                    });
                    pageToken = sleep.nextPageToken || "";
                    if (!pageToken) break;
                }
                Object.keys(nights).forEach((iso) => {
                    if (nights[iso] > 0) {
                        const f = fitness[iso] || (fitness[iso] = {});
                        f.sleep = Math.round((nights[iso] / 60) * 10) / 10;
                        f.src_sleep = "google";
                    }
                });
            } catch (e) {
                if (e.message === "expired") throw e;
                console.error("Google sleep sync failed", e);
                notes.push(e.status === 403 ? "sleep not shared (403)" : `sleep failed (${e.message})`);
            }

            saveFit();
            const now = new Date();
            setFitStatus(`Synced at ${pad2(now.getHours())}:${pad2(now.getMinutes())}${notes.length ? `. Skipped: ${notes.join(", ")}` : ""}`, notes.length ? "warn" : "good");
        } catch (e) {
            setFitStatus(e.message === "expired" ? "Google session ended. Press Connect Google Health to link again." : `Google sync failed: ${e.message}`, "bad");
        } finally {
            syncing = false;
            renderStats();
        }
    }

    function loadGIS() {
        return new Promise((resolve, reject) => {
            if (window.google && google.accounts && google.accounts.oauth2) { resolve(); return; }
            const s = document.createElement("script");
            s.src = "https://accounts.google.com/gsi/client";
            s.async = true;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error("Could not load Google sign-in. Check your internet connection."));
            document.head.appendChild(s);
        });
    }

    async function connectGoogle() {
        if (!HEALTH_ON) return;
        if (location.protocol === "file:") { toast("Open the online website to connect Google Health."); return; }
        try { await loadGIS(); } catch (e) { toast(e.message); return; }
        const client = google.accounts.oauth2.initTokenClient({
            client_id: GID,
            login_hint: currentUser.email || undefined,
            scope: HEALTH_SCOPES,
            callback: (resp) => {
                if (resp.error) { toast(`Google connection stopped: ${resp.error}`); return; }
                sessionStorage.setItem("lifetrack-gtoken", JSON.stringify({ token: resp.access_token, exp: Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000 }));
                if (resp.scope && !resp.scope.includes("activity_and_fitness")) toast("Steps permission was not granted, so steps will stay manual.");
                syncGoogle();
            }
        });
        client.requestAccessToken({ prompt: "" });
    }

    function disconnectGoogle() {
        const token = googleToken();
        if (token && window.google && google.accounts && google.accounts.oauth2) google.accounts.oauth2.revoke(token, () => {});
        sessionStorage.removeItem("lifetrack-gtoken");
        setFitStatus("Disconnected from Google. Manual logging still works.", "");
        renderStats();
    }

    /* ---------- modal + menu ---------- */

    function closeModal() { document.getElementById("modalRoot").innerHTML = ""; }

    function openModal(html) {
        const root = document.getElementById("modalRoot");
        root.innerHTML = `<div class="modal-back" data-close="1"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
        root.querySelector(".modal-back").addEventListener("mousedown", (e) => { if (e.target.dataset.close) closeModal(); });
        root.querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", closeModal));
        const first = root.querySelector("input, button.primary-button");
        if (first) first.focus();
        return root.querySelector(".modal");
    }

    function confirmModal(title, text, okLabel, onOk) {
        const modal = openModal(`<h3>${esc(title)}</h3><p>${esc(text)}</p><div class="modal-actions"><button type="button" class="secondary-button" data-cancel>Cancel</button><button type="button" class="primary-button danger" id="modalOk">${esc(okLabel)}</button></div>`);
        modal.querySelector("#modalOk").addEventListener("click", () => { closeModal(); onOk(); });
    }

    function openProfileEditor() {
        const modal = openModal(`<h3>Edit profile</h3>
            <label class="modal-label" for="pfName">Name</label><input id="pfName" type="text" maxlength="40" value="${esc(currentUser.name)}">
            <label class="modal-label" for="pfEmail">Email</label><input id="pfEmail" type="email" value="${esc(currentUser.email || "")}">
            <p class="modal-error" id="pfErr" hidden>Enter a name to save.</p>
            <div class="modal-actions"><button type="button" class="secondary-button" data-cancel>Cancel</button><button type="button" class="primary-button" id="pfSave">Save profile</button></div>`);
        modal.querySelector("#pfSave").addEventListener("click", () => {
            const name = modal.querySelector("#pfName").value.trim();
            if (!name) { modal.querySelector("#pfErr").hidden = false; return; }
            currentUser.name = name;
            currentUser.email = modal.querySelector("#pfEmail").value.trim();
            localStorage.setItem("lifetrack-user", JSON.stringify(currentUser));
            paintUser();
            closeModal();
            toast("Profile saved.");
        });
    }

    function paintUser() {
        userName.textContent = currentUser.name;
        if (currentUser.picture) {
            profileLetter.innerHTML = `<img alt="" referrerpolicy="no-referrer" src="${esc(currentUser.picture)}">`;
        } else {
            profileLetter.textContent = (Array.from(currentUser.name.trim())[0] || "U").toUpperCase();
        }
    }

    function exportData() {
        const data = { app: "LifeTrack", version: 2, exportedAt: new Date().toISOString(), user: { name: currentUser.name, email: currentUser.email || "" }, habits, checks, habitStarts, body: bodyProfile, goals, fitness };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `lifetrack-backup-${isoFromUTC(todayUTC())}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        toast("Backup downloaded.");
    }

    function importData(file) {
        const reader = new FileReader();
        reader.onload = () => {
            let data;
            try { data = JSON.parse(reader.result); } catch (e) { toast("That file is not valid JSON."); return; }
            if (!data || data.app !== "LifeTrack" || !Array.isArray(data.habits) || typeof data.checks !== "object") { toast("That is not a LifeTrack backup."); return; }
            confirmModal("Replace your data?", `This will replace your current habits, check-ins, goals and fitness log with the backup from ${data.exportedAt ? data.exportedAt.slice(0, 10) : "the file"}.`, "Replace data", () => {
                habits = data.habits.map(String);
                checks = data.checks || {};
                habitStarts = data.habitStarts || {};
                bodyProfile = data.body || null;
                goals = Array.isArray(data.goals) ? data.goals : goals;
                fitness = data.fitness || {};
                saveState(); saveGoals(); saveFit();
                if (bodyProfile) store.set("body", JSON.stringify(bodyProfile)); else store.remove("body");
                ensureYearOptions();
                renderCalendar();
                toast("Backup restored.");
            });
        };
        reader.readAsText(file);
    }

    function doLogout() {
        localStorage.removeItem("lifetrack-user");
        sessionStorage.removeItem("lifetrack-gtoken");
        window.location.href = "index.html";
    }

    const profileMenu = document.getElementById("profileMenu");
    const logoBtn = document.getElementById("logoBtn");
    const userChip = document.getElementById("userChip");
    let menuOpener = null;

    function closeMenu() {
        profileMenu.hidden = true;
        logoBtn.setAttribute("aria-expanded", "false");
        userChip.setAttribute("aria-expanded", "false");
    }

    function openMenu(opener) {
        menuOpener = opener;
        const linked = Boolean(googleToken());
        const isGoogle = currentUser.provider === "google";
        const avatar = currentUser.picture ? `<img alt="" referrerpolicy="no-referrer" src="${esc(currentUser.picture)}">` : esc((Array.from(currentUser.name.trim())[0] || "U").toUpperCase());
        profileMenu.innerHTML = `<div class="pm-head"><span class="profile pm-avatar">${avatar}</span><div><strong>${esc(currentUser.name)}</strong><small>${esc(currentUser.email || (currentUser.name === "Guest" ? "Guest, data stays on this device" : "No email added"))}</small>${isGoogle ? `<span class="chip">Signed in with Google</span>` : ""}</div></div>
            <div class="pm-list" role="none">
                <button type="button" role="menuitem" data-act="edit">✏️ Edit profile</button>
                <button type="button" role="menuitem" data-act="body">⚖️ Body profile</button>
                ${!HEALTH_ON ? "" : linked ? `<button type="button" role="menuitem" data-act="gsync">🔄 Sync Google Health</button><button type="button" role="menuitem" data-act="gdisc">🔌 Disconnect Google Health</button>` : `<button type="button" role="menuitem" data-act="gconn">🏃 Connect Google Health</button>`}
                <hr>
                <button type="button" role="menuitem" data-act="export">⬇️ Download backup</button>
                <button type="button" role="menuitem" data-act="import">⬆️ Restore backup</button>
                <button type="button" role="menuitem" class="danger" data-act="reset">🗑️ Delete all my data</button>
                <hr>
                <button type="button" role="menuitem" class="danger" data-act="logout">🚪 Log out</button>
            </div>`;
        profileMenu.hidden = false;
        const r = opener.getBoundingClientRect();
        const w = profileMenu.offsetWidth;
        let left;
        let top;
        if (opener === logoBtn) { left = r.right + 12; top = Math.max(8, r.top); } else { left = r.right - w; top = r.bottom + 8; }
        left = clamp(left, 8, window.innerWidth - w - 8);
        const maxTop = window.innerHeight - profileMenu.offsetHeight - 8;
        profileMenu.style.left = `${left}px`;
        profileMenu.style.top = `${clamp(top, 8, Math.max(8, maxTop))}px`;
        opener.setAttribute("aria-expanded", "true");
        const firstItem = profileMenu.querySelector("button");
        if (firstItem) firstItem.focus();
    }

    function toggleMenu(opener) {
        if (!profileMenu.hidden && menuOpener === opener) closeMenu(); else openMenu(opener);
    }

    logoBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleMenu(logoBtn); });
    userChip.addEventListener("click", (e) => { e.stopPropagation(); toggleMenu(userChip); });
    document.addEventListener("click", (e) => { if (!profileMenu.hidden && !profileMenu.contains(e.target)) closeMenu(); });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            if (!profileMenu.hidden) { closeMenu(); if (menuOpener) menuOpener.focus(); }
            closeModal();
        }
    });

    profileMenu.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-act]");
        if (!b) return;
        const act = b.dataset.act;
        closeMenu();
        if (act === "edit") openProfileEditor();
        else if (act === "body") {
            document.querySelector('.nav-item[data-section="dashboard"]').click();
            editingBody = true;
            renderDailyReminder(lastLife || computeLifetime());
            dailyReminder.scrollIntoView({ behavior: "smooth", block: "center" });
        } else if (act === "gconn") connectGoogle();
        else if (act === "gsync") syncGoogle();
        else if (act === "gdisc") disconnectGoogle();
        else if (act === "export") exportData();
        else if (act === "import") document.getElementById("importFile").click();
        else if (act === "reset") {
            confirmModal("Delete all your data?", "This removes your habits, check-ins, goals, body profile and fitness log from this browser. Download a backup first if you might want it back.", "Delete everything", () => {
                ["habits", "checks", "habit-start", "body", "goals", "fitness"].forEach((k) => store.remove(k));
                window.location.reload();
            });
        } else if (act === "logout") doLogout();
    });

    document.getElementById("importFile").addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) importData(file);
        e.target.value = "";
    });

    /* ---------- page handlers ---------- */

    document.getElementById("fitActions").addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        if (b.id === "gConnect") connectGoogle();
        if (b.id === "gSync") syncGoogle();
    });

    document.getElementById("fitBody").addEventListener("click", (e) => {
        const w = e.target.closest("[data-water]");
        const mo = e.target.closest("[data-mood]");
        const iso = isoFromUTC(todayUTC());
        if (w) {
            const cur = (fitness[iso] || {}).water || 0;
            setFit("water", Math.max(0, cur + Number(w.dataset.water)));
        } else if (mo) {
            const f = fitness[iso] || (fitness[iso] = {});
            f.mood = f.mood === Number(mo.dataset.mood) ? undefined : Number(mo.dataset.mood);
            if (!f.mood) delete f.mood;
            saveFit();
            renderStats();
        }
    });

    document.getElementById("fitBody").addEventListener("change", (e) => {
        const inp = e.target.closest("input[data-field]");
        if (!inp) return;
        const v = parseFloat(inp.value);
        setFit(inp.dataset.field, Number.isFinite(v) ? v : null);
    });

    habitManageList.addEventListener("click", (e) => {
        const b = e.target.closest("[data-remove]");
        if (!b) return;
        const idx = Number(b.dataset.remove);
        const name = habits[idx];
        confirmModal(`Remove "${name}"?`, "The habit disappears from your tracker and its goals are removed. Its old check-ins stay saved in case you add the same name again.", "Remove habit", () => {
            delete habitStarts[name];
            habits.splice(idx, 1);
            goals = goals.filter((g) => g.habit !== name);
            saveGoals();
            saveState();
            renderCalendar();
        });
    });

    document.getElementById("goalPageList").addEventListener("click", (e) => {
        const b = e.target.closest("[data-goal-remove]");
        if (!b) return;
        goals = goals.filter((g) => g.id !== b.dataset.goalRemove);
        saveGoals();
        renderStats();
    });

    const goalTarget = document.getElementById("goalTarget");
    goalTarget.addEventListener("input", () => { document.getElementById("goalTargetOut").textContent = `${goalTarget.value}%`; });
    document.getElementById("goalForm").addEventListener("submit", (e) => {
        e.preventDefault();
        const nameEl = document.getElementById("goalName");
        const habit = document.getElementById("goalHabit").value || "*";
        const name = nameEl.value.trim() || (habit === "*" ? "All habits goal" : `${habit} goal`);
        goals.push({ id: `g-${Date.now()}`, name, habit, target: Number(goalTarget.value) });
        nameEl.value = "";
        saveGoals();
        renderStats();
    });

    document.getElementById("analyticsSeg").addEventListener("click", (e) => {
        const b = e.target.closest("button[data-view]");
        if (!b) return;
        analyticsView = b.dataset.view;
        document.querySelectorAll("#analyticsSeg button").forEach((x) => x.classList.toggle("active", x === b));
        document.getElementById("anMonth").hidden = analyticsView !== "month";
        document.getElementById("anYear").hidden = analyticsView !== "year";
    });

    // "live" fitness: refresh every minute while the tab is visible and Google is linked
    setInterval(() => { if (document.visibilityState === "visible" && googleToken()) syncGoogle(); }, 60000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && googleToken()) syncGoogle(); });
    if (HEALTH_ON && location.protocol !== "file:") loadGIS().catch(() => {});

    document.querySelectorAll(".nav-item").forEach((button) => {
        button.addEventListener("click", () => {
            document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
            document.querySelectorAll(".section").forEach((section) => section.classList.remove("active-section"));
            button.classList.add("active");
            document.getElementById(button.dataset.section).classList.add("active-section");
            document.getElementById("pageTitle").textContent = button.querySelector(".nav-text").textContent;
        });
    });

    document.getElementById("addHabitBtn").addEventListener("click", () => {
        const input = document.getElementById("newHabitInput");
        const habit = input.value.trim();
        if (!habit || habits.includes(habit)) return;

        habits.push(habit);
        habitStarts[habit] = isoFromUTC(todayUTC());
        input.value = "";
        saveState();
        renderCalendar();
    });

    document.getElementById("newHabitInput").addEventListener("keydown", (event) => {
        if (event.key === "Enter") document.getElementById("addHabitBtn").click();
    });

    document.getElementById("resetBtn").addEventListener("click", () => {
        const days = getDaysInSelectedMonth();

        habits.forEach((habit) => {
            for (let day = 1; day <= days; day += 1) {
                delete checks[storageKey(day, habit)];
            }
        });

        saveState();
        renderCalendar();
    });

    function setTheme(isDark) {
        document.body.classList.toggle("dark", isDark);
        themeToggle.setAttribute("aria-pressed", String(isDark));
        themeToggle.querySelector(".nav-icon").textContent = isDark ? "☀" : "🌙";
        themeToggle.querySelector(".nav-text").textContent = isDark ? "Light Mode" : "Dark Mode";
        localStorage.setItem("lifetrack-theme", isDark ? "dark" : "light");
    }

    themeToggle.addEventListener("click", () => {
        setTheme(!document.body.classList.contains("dark"));
    });

    document.getElementById("bodyEditBtn").addEventListener("click", () => {
        editingBody = !editingBody;
        renderDailyReminder(lastLife || computeLifetime());
    });

    // make sure every year that has data (up to ~5+ years back) is selectable
    function ensureYearOptions() {
        const scan = scanTicks();
        const nowYear = new Date().getFullYear();
        const firstYear = scan.first === null ? nowYear : new Date(scan.first).getUTCFullYear();
        const from = Math.min(2025, firstYear);
        const to = Math.max(2030, nowYear);
        const have = new Set(Array.from(yearSelect.options).map((o) => o.value));
        for (let y = from; y <= to; y += 1) {
            if (!have.has(String(y))) yearSelect.add(new Option(String(y), String(y)));
        }
        Array.from(yearSelect.options)
            .sort((a, b) => Number(a.value) - Number(b.value))
            .forEach((o) => yearSelect.appendChild(o));
    }

    // when midnight passes, unlock the new day and refresh the daily plan
    setInterval(() => {
        if (renderedDay !== null && todayUTC() !== renderedDay) renderCalendar();
    }, 60000);

    monthSelect.addEventListener("change", renderCalendar);
    yearSelect.addEventListener("change", renderCalendar);

    paintUser();
    ensureYearOptions();
    setLiveMonthAndYear();
    setTheme(localStorage.getItem("lifetrack-theme") === "dark");
    renderCalendar();
    if (googleToken()) syncGoogle();

})();

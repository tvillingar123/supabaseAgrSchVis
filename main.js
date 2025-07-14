// Extract URL parameters
const urlParams = new URLSearchParams(window.location.search);
const apiKey = urlParams.get('apikey');
const supaUrl = urlParams.get('supaurl');

// Optional: hide the query params from the address bar
window.history.replaceState({}, document.title, window.location.pathname);

// Check if both are present
if (apiKey && supaUrl) {
  // Example: fetch data from Supabase REST API
  fetch(`${supaUrl}/rest/v1/your_table`, {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`
    }
  })
    .then(res => res.json())
    .then(data => {
      console.log('Supabase data:', data);
      // Do something with the data
    })
    .catch(err => console.error('Supabase error:', err));
} else {
  console.error('Missing Supabase URL or API key in URL');
}

const supabase = window.supabase.createClient(supaUrl, apiKey);

let rawData = [];
let filteredData = [];

// 🌗 THEME HANDLING
function setTheme(mode) {
    document.body.classList.toggle("dark", mode === "dark");
    document.cookie = "theme=" + mode + ";path=/;max-age=31536000";
}
function applyTimeFilter(range) {
    const now = Date.now();
    let cutoff = 0;
    if (range === "day")   cutoff = now - 24 * 60 * 60 * 1000;
    if (range === "week")  cutoff = now - 7 * 24 * 60 * 60 * 1000;
    if (range === "month") cutoff = now - 30 * 24 * 60 * 60 * 1000;
    
    filteredData = (range === "all")
    ? [...rawData]
    : rawData.filter(d => d.time.getTime() >= cutoff);
}
function getTheme() {
    const match = document.cookie.match(/theme=(light|dark)/);
    return match ? match[1] : null;
}

document.addEventListener("DOMContentLoaded", () => {
    const themeBtn = document.getElementById("theme-toggle");
    
    const userTheme = getTheme();
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(userTheme || (systemDark ? "dark" : "light"));
    
    // Time buttons
    document.querySelectorAll("#time-buttons button").forEach(btn => {
        btn.addEventListener("click", () => {
            const range = btn.dataset.range;
            applyTimeFilter(range);
            renderAll();
            
            document.querySelectorAll("#time-buttons button").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
        });
    });
    
    if (themeBtn) {
        themeBtn.addEventListener("click", () => {
            const isDark = document.body.classList.contains("dark");
            setTheme(isDark ? "light" : "dark");
        });
    }
    
    if (window.innerWidth <= 768) {
        document.querySelectorAll(".chart-panel").forEach((el, i) => {
            if (i !== 0) el.removeAttribute("open");
        });
    }
});
// 📦 DATA LOADING
async function loadData() {
    const { data, error } = await supabase
    .from("balcony_data")
    .select("*")
    .order("created_at", { ascending: true });
    if (error) throw error;
    
    rawData = data.map(d => ({
        time: new Date(d.created_at),
        MTemp: d.MTemp, PTemp: d.PTemp,
        MHum: d.MHum, PHum: d.PHum,
        MAirp: d.MAirp, PAirp: d.PAirp,
        MSoil1: d.MSoil1, MSoil2: d.MSoil2, MSoil3: d.MSoil3,
        PRain: d.PRain, PWind: d.PWind,
        PUv: d.PUv
    }));
    filteredData = [...rawData];
}

// 🧮 LATEST TABLE
function updateLatestTable() {
    const latest = filteredData[filteredData.length - 1];
    const tbls = [d3.select("#latest-table").html(""), d3.select("#latest-bottom").html("")];
    
    const keys = [
        { label: "Temp (Local)", key: "MTemp", unit: "°C" },
        { label: "Temp (API)", key: "PTemp", unit: "°C" },
        { label: "Humidity (Local)", key: "MHum", unit: "%" },
        { label: "Humidity (API)", key: "PHum", unit: "%" },
        { label: "Pressure (Local)", key: "MAirp", unit: "hPa" },
        { label: "Pressure (API)", key: "PAirp", unit: "hPa" },
        { label: "Soil #1", key: "MSoil1", unit: "" },
        { label: "Soil #2", key: "MSoil2", unit: "" },
        { label: "Soil #3", key: "MSoil3", unit: "" },
        { label: "Rain (API)", key: "PRain", unit: "mm" },
        { label: "Wind (API)", key: "PWind", unit: "m/s" },
        { label: "UV Index", key: "PUv", unit: "" }
    ];
    
    tbls.forEach(tbl => {
        const thead = tbl.append("thead").append("tr");
        thead.append("th").text("Variable");
        thead.append("th").text("Value");
        
        const tbody = tbl.append("tbody");
        tbody.append("tr")
        .append("td").text("Timestamp")
        .append("td").text(latest.time.toLocaleString());
        
        keys.forEach(({ label, key, unit }) => {
            const val = latest[key] != null
            ? `${(key === "PWind" ? latest[key] / 3.6 : latest[key]).toFixed(1)}${unit}`
            : "—";
            const tr = tbody.append("tr");
            tr.append("td").text(label);
            tr.append("td").text(val);
        });
    });
}

// 📊 CHARTS
function drawLineChart({ id, series, yLabel, bgBands }) {
    const container = d3.select(`#${id}`);
    container.selectAll("*").remove();
    const margin = { top: 20, right: 20, bottom: 30, left: 50 };
    const W = container.node().clientWidth - margin.left - margin.right;
    const H = container.node().clientHeight - margin.top - margin.bottom;
    
    const svg = container.append("svg")
    .attr("viewBox", `0 0 ${W + margin.left + margin.right} ${H + margin.top + margin.bottom}`)
    .attr("preserveAspectRatio", "xMinYMin meet")
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);
    
    const x = d3.scaleTime()
    .domain(d3.extent(filteredData, d => d.time))
    .range([0, W]);
    
    const y = d3.scaleLinear()
    .domain([
        d3.min(series, s => d3.min(filteredData, d => d[s])),
        d3.max(series, s => d3.max(filteredData, d => d[s]))
    ])
    .nice()
    .range([H, 0]);
    
    svg.append("g").attr("transform", `translate(0,${H})`).call(d3.axisBottom(x).ticks(4));
    svg.append("g").call(d3.axisLeft(y).ticks(5));
    
    // 🟫 Reference line for soil moisture threshold
    if (id === "chart-soil") {
        svg.append("line")
        .attr("x1", 0)
        .attr("x2", W)
        .attr("y1", y(40))
        .attr("y2", y(40))
        .attr("stroke", "#844")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "4,4");
        
        svg.append("text")
        .attr("x", 10)
        .attr("y", y(40) - 6)
        .text("Threshold: 40")
        .style("font-size", "0.8em")
        .attr("fill", "#844");
        
    }
    
    if (bgBands) {
        bgBands.forEach(b => {
            svg.append("rect")
            .attr("x", 0)
            .attr("y", y(b.max))
            .attr("width", W)
            .attr("height", H - y(b.max))
            .attr("fill", b.color)
            .attr("opacity", 0.2)
            .lower();
        });
    }
    
    const color = d3.scaleOrdinal(d3.schemeCategory10);
    series.forEach((s, i) => {
        svg.append("path")
        .datum(filteredData.filter(d => d[s] != null))
        .attr("fill", "none")
        .attr("stroke", color(i))
        .attr("stroke-width", 2)
        .attr("d", d3.line().x(d => x(d.time)).y(d => y(d[s])));
    });
    
    const focus = svg.append("g").style("display", "none");
    focus.append("line").attr("stroke", "#666").attr("y1", 0).attr("y2", H).attr("stroke-dasharray", "3,3");
    
    series.forEach((s, i) => {
        focus.append("circle").attr("r", 4).attr("fill", color(i)).attr("class", `dot-${i}`);
    });
    
    svg.append("rect")
    .attr("width", W)
    .attr("height", H)
    .attr("fill", "none")
    .attr("pointer-events", "all")
    .on("mouseover", () => focus.style("display", null))
    .on("mouseout", () => {
        const tooltip = document.getElementById("tooltip");
        tooltip.style.display = "none";
        
        focus.style("display", "none");
    })
    .on("mousemove", function (event) {
        const tooltip = document.getElementById("tooltip");
        
        const [xm, ym] = d3.pointer(event);
        const t = x.invert(xm);
        const i = d3.bisector(d => d.time).left(filteredData, t);
        const d0 = filteredData[i - 1], d1 = filteredData[i];
        const d = !d0 ? d1 : !d1 ? d0 : (t - d0.time > d1.time - t) ? d1 : d0;
        
        // 🧭 Hover line
        focus.select("line").attr("x1", x(d.time)).attr("x2", x(d.time));
        
        // 🧮 Tooltip content
        let tipHtml = `<strong>${d.time.toLocaleString()}</strong><br/>`;
        series.forEach(s => {
            const val = d[s];
            if (val != null) {
                tipHtml += `${s}: ${val}<br/>`;
            }
        });
        
        tooltip.innerHTML = tipHtml;
        tooltip.style.display = "block";
        
        // 📍 Position tooltip (clamped to viewport)
        const pageWidth = document.body.clientWidth;
        const offsetX = event.pageX + 12;
        const offsetY = event.pageY + 12;
        const maxTooltipWidth = 200;
        
        tooltip.style.left = `${Math.min(offsetX, pageWidth - maxTooltipWidth)}px`;
        tooltip.style.top = `${offsetY}px`;
        
        // 🧑‍🏫 Dots + inline labels
        series.forEach((s, j) => {
            const val = d[s];
            if (val == null) return;
            
            focus.select(`.dot-${j}`).attr("cx", x(d.time)).attr("cy", y(val));
            
            const label = `${s}: ${val} @ ${d.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            const xPos = x(d.time);
            const textWidth = label.length * 6;
            const anchor = xPos + textWidth > W ? "end" : "start";
            
            focus.select(`.txt-${j}`)
            .attr("x", xPos + (anchor === "start" ? 6 : -6))
            .attr("y", y(val))
            .attr("text-anchor", anchor)
            .text(label);
        });
    });
    
    svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", -margin.left + 15)
    .attr("x", -H / 2)
    .style("text-anchor", "middle")
    .text(yLabel);
    
    const lg = svg.append("g").attr("transform", `translate(${W - 80}, 0)`);
    series.forEach((s, i) => {
        const g = lg.append("g").attr("transform", `translate(0,${i * 20})`);
        g.append("rect").attr("width", 10).attr("height", 10).attr("fill", color(i));
        g.append("text").attr("x", 15).attr("y", 10).text(s);
    });
}

function pearson(x, y) {
    const mx = d3.mean(x), my = d3.mean(y);
    const num = d3.sum(x.map((v, i) => (v - mx) * (y[i] - my)));
    const den = Math.sqrt(
                          d3.sum(x.map(v => (v - mx) ** 2)) *
                          d3.sum(y.map(v => (v - my) ** 2))
                          );
    return num / den;
}

function renderAll() {
    updateLatestTable();
    
    drawLineChart({ id: "chart-temp",  series: ["MTemp", "PTemp"],  yLabel: "Temperature (°C)" });
    drawLineChart({ id: "chart-hum",   series: ["MHum",  "PHum"],   yLabel: "Humidity (%)" });
    drawLineChart({ id: "chart-airp",  series: ["MAirp", "PAirp"],  yLabel: "Air Pressure (hPa)" });
    drawLineChart({ id: "chart-soil",  series: ["MSoil1", "MSoil2", "MSoil3"], yLabel: "Soil Moisture" });
    drawLineChart({ id: "chart-rain",  series: ["PRain"], yLabel: "Rain (mm)" });
    drawLineChart({ id: "chart-wind",  series: ["PWind"], yLabel: "Wind (m/s)" });
    drawLineChart({
        id: "chart-uv",
        series: ["PUv"],
        yLabel: "UV Index",
        bgBands: [
            { max: 2, color: "#00FF00" },
            { max: 5, color: "#FFFF00" },
            { max: 7, color: "#FFA500" },
            { max: 10, color: "#FF0000" },
            { max: Infinity, color: "#800080" }
        ]
    });
    
    const soilAvg = filteredData.map(d =>
                                     (d.MSoil1 + d.MSoil2 + d.MSoil3) / 3
                                     );
    
    const vars = ["PRain", "PWind", "MAirp", "MTemp", "MHum", "PUv"];
    const rows = vars.map(v => {
        const yArr = filteredData.map(d => d[v]);
        const r = pearson(soilAvg, yArr);
        return [v, r.toFixed(3)];
    });
    
    const corr = d3.select("#correlation")
    .html("<h2>Soil Moisture Correlations</h2>")
    .append("table");
    
    const thead = corr.append("thead").append("tr");
    thead.append("th").text("Variable");
    thead.append("th").text("Pearson r");
    
    const tbody = corr.append("tbody");
    rows.forEach(([name, r]) => {
        const tr = tbody.append("tr");
        tr.append("td").text(name);
        tr.append("td").text(r);
    });
}

window.addEventListener("resize", renderAll);

loadData().then(() => {
    applyTimeFilter("all");
    renderAll();
});

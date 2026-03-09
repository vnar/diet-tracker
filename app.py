import streamlit as st
import sqlite3
import json
import base64
from datetime import datetime, date
from io import BytesIO
from PIL import Image
import anthropic

st.set_page_config(page_title="Diet & Weight Tracker", page_icon="🥗", layout="centered")

# -----------------------------
# Config
# -----------------------------
client = anthropic.Anthropic(api_key=st.secrets.get("ANTHROPIC_API_KEY", ""))
DB_PATH = "diet_tracker.db"

# -----------------------------
# Database
# -----------------------------
def init_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS meals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            meal_date TEXT NOT NULL,
            description TEXT,
            calories REAL,
            protein REAL,
            carbs REAL,
            fat REAL,
            confidence TEXT,
            notes TEXT
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS weights (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            weight_date TEXT NOT NULL,
            weight REAL NOT NULL,
            note TEXT
        )
    """)
    conn.commit()
    conn.close()


def save_meal(meal_date, description, calories, protein, carbs, fat, confidence, notes=""):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO meals (ts, meal_date, description, calories, protein, carbs, fat, confidence, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (datetime.now().isoformat(), meal_date.isoformat(), description, calories, protein, carbs, fat, confidence, notes))
    conn.commit()
    conn.close()


def save_weight(weight_date, weight, note=""):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO weights (ts, weight_date, weight, note)
        VALUES (?, ?, ?, ?)
    """, (datetime.now().isoformat(), weight_date.isoformat(), weight, note))
    conn.commit()
    conn.close()


def get_meals():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT meal_date, description, calories, protein, carbs, fat, confidence, notes FROM meals ORDER BY meal_date DESC, id DESC")
    rows = cur.fetchall()
    conn.close()
    return rows


def get_weights():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT weight_date, weight, note FROM weights ORDER BY weight_date DESC, id DESC")
    rows = cur.fetchall()
    conn.close()
    return rows


def get_daily_calories():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT meal_date, ROUND(SUM(calories), 0) FROM meals GROUP BY meal_date ORDER BY meal_date ASC")
    rows = cur.fetchall()
    conn.close()
    return rows


# -----------------------------
# Helpers
# -----------------------------
def image_to_base64(uploaded_file):
    img = Image.open(uploaded_file).convert("RGB")
    buffer = BytesIO()
    img.save(buffer, format="JPEG", quality=90)
    return base64.standard_b64encode(buffer.getvalue()).decode("utf-8")


def analyze_food_image(uploaded_file):
    if not st.secrets.get("ANTHROPIC_API_KEY"):
        return {
            "description": "API key missing",
            "estimated_calories": 0,
            "protein_g": 0,
            "carbs_g": 0,
            "fat_g": 0,
            "confidence": "low",
            "notes": "Add ANTHROPIC_API_KEY to Streamlit secrets."
        }

    img_data = image_to_base64(uploaded_file)

    prompt = """Analyze this food photo and estimate a single-meal nutritional summary.
Return ONLY valid JSON with these exact keys:
description, estimated_calories, protein_g, carbs_g, fat_g, confidence, notes

Rules:
- Use numbers only for calories/macros (no strings).
- Be conservative if portion size is unclear.
- confidence must be one of: low, medium, high.
- notes should mention key uncertainty, e.g. oil, hidden sugar, portion size.

Return only the JSON object, no markdown, no explanation."""

    message = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=512,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": img_data,
                        },
                    },
                    {
                        "type": "text",
                        "text": prompt
                    }
                ],
            }
        ],
    )

    text = message.content[0].text
    try:
        # Strip markdown code fences if present
        clean = text.strip()
        if clean.startswith("```"):
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
        return json.loads(clean.strip())
    except Exception:
        return {
            "description": "Could not parse model output",
            "estimated_calories": 0,
            "protein_g": 0,
            "carbs_g": 0,
            "fat_g": 0,
            "confidence": "low",
            "notes": text[:500]
        }


# -----------------------------
# UI
# -----------------------------
init_db()

st.title("🥗 Diet & Weight Tracker")
st.caption("Snap food, estimate calories, and log weight day to day.")

tab1, tab2, tab3 = st.tabs(["📷 Photo Log", "⚖️ Weight Log", "📊 History"])

with tab1:
    st.subheader("Photograph your food")
    meal_date = st.date_input("Meal date", value=date.today(), key="meal_date")
    photo = st.camera_input("Take a food photo")

    if photo is not None:
        st.image(photo, caption="Captured meal", use_container_width=True)
        if st.button("🔍 Analyze calories", type="primary"):
            with st.spinner("Analyzing with Claude..."):
                result = analyze_food_image(photo)
            st.session_state["meal_result"] = result

    result = st.session_state.get("meal_result")
    if result:
        description = st.text_input("Description", value=str(result.get("description", "")))
        calories = st.number_input("Calories", min_value=0.0, step=1.0, value=float(result.get("estimated_calories", 0) or 0))
        protein = st.number_input("Protein (g)", min_value=0.0, step=1.0, value=float(result.get("protein_g", 0) or 0))
        carbs = st.number_input("Carbs (g)", min_value=0.0, step=1.0, value=float(result.get("carbs_g", 0) or 0))
        fat = st.number_input("Fat (g)", min_value=0.0, step=1.0, value=float(result.get("fat_g", 0) or 0))
        conf_options = ["low", "medium", "high"]
        conf_default = result.get("confidence", "medium")
        confidence = st.selectbox("Confidence", conf_options, index=conf_options.index(conf_default) if conf_default in conf_options else 1)
        notes = st.text_area("Notes", value=str(result.get("notes", "")))

        if st.button("💾 Save meal"):
            save_meal(meal_date, description, calories, protein, carbs, fat, confidence, notes)
            st.success("Meal saved!")
            st.session_state.pop("meal_result", None)

with tab2:
    st.subheader("Log body weight")
    weight_date = st.date_input("Weight date", value=date.today(), key="weight_date")
    weight = st.number_input("Weight (kg)", min_value=0.0, step=0.1, format="%.1f")
    note = st.text_input("Note", placeholder="e.g. morning fasted")
    if st.button("💾 Save weight"):
        save_weight(weight_date, weight, note)
        st.success("Weight saved!")

with tab3:
    st.subheader("History")

    daily = get_daily_calories()
    if daily:
        st.write("### Daily calories")
        st.line_chart({"Calories": {d: c for d, c in daily}})

    weights = get_weights()
    if weights:
        st.write("### Weight trend")
        chart_data = {d: w for d, w, _ in reversed(weights)}
        st.line_chart({"Weight (kg)": chart_data})
        with st.expander("Weight entries"):
            for d, w, n in weights:
                st.write(f"**{d}** — {w} kg" + (f" · {n}" if n else ""))

    meals = get_meals()
    if meals:
        with st.expander("Meal entries"):
            for row in meals:
                d, desc, cal, p, c, f, conf, notes = row
                st.write(f"**{d}** — {desc}")
                st.write(f"Calories: {cal} | Protein: {p}g | Carbs: {c}g | Fat: {f}g | Confidence: {conf}")
                if notes:
                    st.caption(notes)
                st.divider()

st.markdown("---")
st.caption("For best accuracy: photograph in good light, keep the full plate in frame, and correct estimates before saving.")

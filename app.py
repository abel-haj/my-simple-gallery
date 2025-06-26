from flask import Flask

app = Flask(__name__)

@app.route("/")
def _():
    return "hi"



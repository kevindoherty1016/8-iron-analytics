import re

with open('app.js', 'r') as f:
    content = f.read()

# Try finding unbalanced brackets manually
# But wait, esprima isn't available. Let's look at the node process.

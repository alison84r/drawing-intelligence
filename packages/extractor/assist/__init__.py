"""
Assist: a vision model reads a region the deterministic pass cannot (a title block pasted as a picture,
a tolerance table in an unusual layout). Its answer is a suggestion with a source, never applied on its own.

The model sits behind one interface so the cloud provider used for development can be replaced by a
local runtime at a customer site without touching the callers. It is off unless configured.
"""

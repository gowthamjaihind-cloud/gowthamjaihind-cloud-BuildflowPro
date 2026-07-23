import os

filepath = "src/server/telegram/index.ts"
with open(filepath, "r") as f:
    text = f.read()

replacement = """
      } catch (err: any) {
        if (err.message && err.message.includes("Conflict: terminated by other getUpdates request")) {
          // Ignore conflict errors from multiple instances running in preview
        } else if (err.message && err.message.includes("Missing or insufficient permissions")) {
          if (!global.loggedPermissionError) {
             console.error("\n========================================================");
             console.error("🔥 TELEGRAM BOT DISABLED: FIRESTORE PERMISSIONS 🔥");
             console.error("The bot cannot access Firestore because Anonymous Authentication is disabled.");
             console.error("Please enable 'Anonymous' in Firebase Console -> Authentication -> Sign-in method.");
             console.error("Polling is paused until the server is restarted with valid permissions.");
             console.error("========================================================\n");
             global.loggedPermissionError = true;
          }
          return; // Stop polling to avoid log spam
        } else if (err.message && !err.message.includes("timeout")) {
          console.error("Polling error:", err.message);
        }
      }
"""

text = text.replace("""      } catch (err: any) {
        if (err.message && err.message.includes("Conflict: terminated by other getUpdates request")) {
          // Ignore conflict errors from multiple instances running in preview
        } else if (err.message && !err.message.includes("timeout")) {
          console.error("Polling error:", err.message);
        }
      }""", replacement)

with open(filepath, "w") as f:
    f.write(text)

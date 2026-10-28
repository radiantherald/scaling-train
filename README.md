# Presentation Scoring & Feedback Portal

A clean, responsive, and minimalistic web portal designed for audience and peer evaluations.

## 🌟 Key Features

1. **QR Code Landing (`/qr`)**:
   - Generates and presents a clean QR code that anyone on the same Wi-Fi / network can scan with their phone.
   - Automatically detects your local network IP and generates direct evaluation links.

2. **Evaluator Scoring UI (`/`)**:
   - **13 Presenters**: Dynamic list of all 13 presenters with avatar badges and presentation topics.
   - **39-Point Total Budget**: Sticky live budget tracker that monitors allocated vs remaining points.
   - **Strict Budget Guardrails**: Prevents distributing more than 39 points with live visual warnings and disabled submit buttons.
   - **Presentation Comments**: Clean text area per presenter for constructive qualitative feedback.
   - **Optional Evaluator Identity**: Reviewers can leave their name or submit anonymously.

3. **Admin Results & Standings (`/admin`)**:
   - **Live Standings & Rankings**: Ranked list of all 13 presenters sorted by highest accumulated score.
   - **Comment Aggregation**: Displays all comments and feedback received per presenter alongside who submitted them and points awarded.
   - **Presenter Editor**: Edit presenter names and topics dynamically right from the admin dashboard without restarting the server.
   - **Auto-Refresh**: Live refreshes every 5 seconds.
   - **Reset Control**: Allows wiping results cleanly for new sessions.

---

## 🚀 How to Run

1. Open your terminal in this project folder:
   ```bash
   node server.js
   ```

2. Open the browser:
   - **Evaluation Portal**: [http://localhost:3000/](http://localhost:3000/)
   - **Scan QR Code Screen**: [http://localhost:3000/qr](http://localhost:3000/qr)
   - **Admin Dashboard**: [http://localhost:3000/admin](http://localhost:3000/admin)

3. For audience members in the room on mobile:
   - Make sure they are connected to the same Wi-Fi or local network.
   - Project or show the `/qr` page on a screen for them to scan.

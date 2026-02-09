# BAR Tracker

A real-time fun audio trigger and streaming overlay system for **Beyond All Reason (BAR)**. This project tracks in-game events via a data stream and provides audio announcements, visual alerts, and customizable dashboard widgets.

## 🚀 Features

* **Real-time Battle Log**: Subscribes to a live event stream (SSE) to track unit production, damage, and destruction.
* **Audio Intelligence**: Integrated Text-to-Speech (TTS) announcements for critical events, such as when high-cost units are finished or destroyed.
* **Streaming Overlay System**: A dedicated streaming view with a layout editor, allowing streamers to place modular widgets (Economy, Combat Stats, Army Value) for broadcast. (coming soon!)

## 🛠️ Tech Stack

* **Backend**: PHP 8.2+, MySQL, and the **Alba CMS** framework.
* **Streaming** LUA widget for BAR, Go App for relaying data from widget, Mercure hub for Server-Sent Event publishing and subscription
* **Frontend**: ES6 JavaScript, HTML5, and CSS3.

## ⚖️ License

This project is licensed under the MIT License.

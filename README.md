# elitemindset-mcp

Minimal MCP (Model Context Protocol) server powering the **EliteMindset** app.

This server exposes a single internal tool that helps users break through overwhelm by identifying one clear, time-boxed next action based on their stated goal and blocker.

---

## Overview

**EliteMindset** is a clarity-focused AI app designed to help users move forward when they feel stuck, overwhelmed, or uncertain.

This repository contains the backend MCP server used by the EliteMindset ChatGPT app.  
It is **not** a standalone user-facing application.

---

## MCP Tool

### Tool Name
`next_best_step`

### Purpose
Returns **one concrete, time-boxed next action** based on:
- the user’s current goal
- the primary blocker preventing progress

The tool intentionally returns **a single step only** to reduce cognitive load and restore momentum.

---

## Tool Inputs

The tool requires the following arguments:

- **`goal`** (string)  
  The outcome the user wants to move toward.

- **`blocker`** (string)  
  What is currently preventing the user from taking action.

Both fields are required.

---

## Tool Output

The tool returns:
- One specific, actionable step
- Explicitly time-boxed
- Designed to be completed immediately or within a short session

Example output:

> “Spend 15 minutes creating a rough outline or draft related to your stated goal. Stop when time is up.”

---

## Endpoint

The MCP server is accessed via JSON-RPC over HTTP:


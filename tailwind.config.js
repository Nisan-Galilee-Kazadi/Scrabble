/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#13212f",
        canvas: "#f7f1e1",
        ember: "#ff7a59",
        gold: "#f4c95d",
        ocean: "#6ec5d6",
        rose: "#f28c8c",
        moss: "#6ea56f"
      },
      boxShadow: {
        panel: "0 18px 45px rgba(19, 33, 47, 0.12)"
      },
      fontFamily: {
        display: ["Trebuchet MS", "Verdana", "sans-serif"],
        body: ["Segoe UI", "sans-serif"]
      }
    }
  },
  plugins: []
};

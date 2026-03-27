import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Globally disable all vibrations
navigator.vibrate = () => true;

createRoot(document.getElementById("root")!).render(<App />);

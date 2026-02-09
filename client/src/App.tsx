import { Navigate, Route, Routes } from "react-router-dom";
import JoinPage from "./pages/JoinPage";
import SlotPage from "./pages/SlotPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<JoinPage />} />
      <Route path="/slot" element={<SlotPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

"use client";

import dynamic from "next/dynamic";

const CanvasMind = dynamic(() => import("@/components/CanvasMind"), {
    ssr: false,
    loading: () => (
        <main className="boot-screen">
            <div className="brand-mark">C</div>
            <p>Opening your canvas…</p>
        </main>
    ),
});

export default function Home() {
    return <CanvasMind />;
}

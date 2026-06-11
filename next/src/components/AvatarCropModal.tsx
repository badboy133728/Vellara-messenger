'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { VellaraIcon } from '@/components/icons/VellaraIcon';
import { canvasToFile, loadOrientedImage } from '@/lib/imageOrientation';

export function AvatarCropModal({
  open,
  file,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  file: File | null;
  onConfirm: (file: File) => void;
  onCancel: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [baseScale, setBaseScale] = useState(1);
  const [stageSize, setStageSize] = useState(320);
  const [radius, setRadius] = useState(140);
  const [rotation, setRotation] = useState(0);

  const dragRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    panStartX: 0,
    panStartY: 0,
  });

  const getRotatedSource = useCallback(() => {
    const src = sourceCanvasRef.current;
    if (!src) return null;
    const turns = ((rotation % 4) + 4) % 4;
    if (turns === 0) return src;
    const out = document.createElement('canvas');
    const ctx = out.getContext('2d');
    if (!ctx) return src;
    const w = src.width;
    const h = src.height;
    if (turns % 2 === 1) {
      out.width = h;
      out.height = w;
    } else {
      out.width = w;
      out.height = h;
    }
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate((Math.PI / 2) * turns);
    ctx.drawImage(src, -w / 2, -h / 2);
    return out;
  }, [rotation]);

  const clampPan = useCallback(
    (px: number, py: number, z: number, bs: number, r: number) => {
      const src = getRotatedSource();
      if (!src) return { x: px, y: py };
      const scale = bs * z;
      const halfW = (src.width * scale) / 2;
      const halfH = (src.height * scale) / 2;
      const maxX = Math.max(0, halfW - r);
      const maxY = Math.max(0, halfH - r);
      return {
        x: Math.min(maxX, Math.max(-maxX, px)),
        y: Math.min(maxY, Math.max(-maxY, py)),
      };
    },
    [getRotatedSource],
  );

  const draw = useCallback(() => {
    const canvas = displayCanvasRef.current;
    const src = getRotatedSource();
    if (!canvas || !src) return;
    const size = stageSize;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const cx = size / 2;
    const cy = size / 2;
    const scale = baseScale * zoom;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx + panX, cy + panY);
    ctx.scale(scale, scale);
    ctx.drawImage(src, -src.width / 2, -src.height / 2);
    ctx.restore();
  }, [baseScale, getRotatedSource, panX, panY, radius, stageSize, zoom]);

  const setupFromSource = useCallback(
    (r: number) => {
      const src = getRotatedSource();
      if (!src) return;
      const bs = Math.max((r * 2) / src.width, (r * 2) / src.height);
      setBaseScale(bs);
      setZoom(1);
      setPanX(0);
      setPanY(0);
    },
    [getRotatedSource],
  );

  const measureStage = useCallback(() => {
    const el = stageRef.current;
    if (!el) return 140;
    const rect = el.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height, 360);
    setStageSize(size);
    const r = size * 0.38;
    setRadius(r);
    return r;
  }, []);

  useEffect(() => {
    if (!open || !file) return;
    let cancelled = false;
    setLoading(true);
    sourceCanvasRef.current = null;
    setRotation(0);
    loadOrientedImage(file)
      .then((canvas) => {
        if (cancelled) return;
        sourceCanvasRef.current = canvas;
        const r = measureStage();
        setupFromSource(r);
      })
      .catch(() => onCancel())
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, file, measureStage, onCancel, setupFromSource]);

  useEffect(() => {
    if (!open) return;
    draw();
  }, [open, draw, zoom, panX, panY, rotation, loading]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      const r = measureStage();
      setupFromSource(r);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, measureStage, setupFromSource]);

  useEffect(() => {
    const clamped = clampPan(panX, panY, zoom, baseScale, radius);
    if (clamped.x !== panX || clamped.y !== panY) {
      setPanX(clamped.x);
      setPanY(clamped.y);
    }
  }, [zoom, baseScale, radius, clampPan, panX, panY]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (loading) return;
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      panStartX: panX,
      panStartY: panY,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const nx = dragRef.current.panStartX + (e.clientX - dragRef.current.startX);
    const ny = dragRef.current.panStartY + (e.clientY - dragRef.current.startY);
    const c = clampPan(nx, ny, zoom, baseScale, radius);
    setPanX(c.x);
    setPanY(c.y);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const confirm = async () => {
    const src = getRotatedSource();
    if (!src || saving) return;
    setSaving(true);
    try {
      const scale = baseScale * zoom;
      const cropSize = (radius * 2) / scale;
      const srcCenterX = src.width / 2 - panX / scale;
      const srcCenterY = src.height / 2 - panY / scale;
      const sx = Math.max(0, Math.min(src.width - cropSize, srcCenterX - cropSize / 2));
      const sy = Math.max(0, Math.min(src.height - cropSize, srcCenterY - cropSize / 2));
      const out = document.createElement('canvas');
      const outSize = 512;
      out.width = outSize;
      out.height = outSize;
      const ctx = out.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(src, sx, sy, cropSize, cropSize, 0, 0, outSize, outSize);
      const cropped = await canvasToFile(out, 'avatar.jpg');
      onConfirm(cropped);
    } finally {
      setSaving(false);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="avatar-crop" role="dialog" aria-modal="true" aria-label="Редактор фото">
      <header className="avatar-crop__head">
        <h2>Фото профиля</h2>
        <p>Перетащите и масштабируйте, как во ВКонтакте</p>
      </header>

      {loading ? (
        <div className="avatar-crop__loading">Загрузка…</div>
      ) : (
        <>
          <div
            ref={stageRef}
            className="avatar-crop__stage"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <canvas ref={displayCanvasRef} className="avatar-crop__canvas" aria-hidden="true" />
            <div
              className="avatar-crop__ring"
              style={{ width: radius * 2, height: radius * 2 }}
              aria-hidden="true"
            />
          </div>
          <div className="avatar-crop__controls">
            <label className="avatar-crop__zoom">
              <span>Масштаб</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
            </label>
            <button
              type="button"
              className="avatar-crop__rotate avatar-crop__rotate--with-icon"
              onClick={() => setRotation((r) => (r + 1) % 4)}
            >
              <VellaraIcon name="refresh" size={16} />
              Повернуть
            </button>
          </div>
        </>
      )}

      <footer className="avatar-crop__footer">
        <button type="button" className="profile-btn profile-btn--outline" onClick={onCancel}>
          Отмена
        </button>
        <button
          type="button"
          className="profile-btn profile-btn--gold"
          disabled={loading || saving}
          onClick={confirm}
        >
          {saving ? 'Сохранение…' : 'Готово'}
        </button>
      </footer>
    </div>,
    document.body,
  );
}

"use client";

import { useState } from "react";
import { toPersianDigits } from "../../../globals/digits";
import { submitReviewAction } from "../../_actions/reviews-actions";

const STARS = [1, 2, 3, 4, 5];

export function ReviewForm({ varietyId, varietySlug }: { varietyId: string; varietySlug: string }) {
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = await submitReviewAction(formData);
    if (!result.ok) {
      setError(result.error ?? "خطایی رخ داد.");
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <p className="rounded-md border border-success/40 bg-success/10 p-4 text-sm text-success">
        نظر شما ثبت شد. سپاس‌گزاریم.
      </p>
    );
  }

  const shownRating = hoverRating ?? rating;

  return (
    <form action={handleSubmit} className="rounded-lg border border-line bg-surface-sunken p-4">
      <input type="hidden" name="varietyId" value={varietyId} />
      <input type="hidden" name="varietySlug" value={varietySlug} />
      <input type="hidden" name="rating" value={rating} />

      <p className="mb-2 text-sm font-medium">امتیاز شما</p>
      <div className="mb-3 flex gap-1" dir="ltr">
        {STARS.map((star) => (
          <button
            key={star}
            type="button"
            aria-label={`${toPersianDigits(String(star))} از ۵ ستاره`}
            onClick={() => setRating(star)}
            onMouseEnter={() => setHoverRating(star)}
            onMouseLeave={() => setHoverRating(null)}
            className="text-2xl leading-none"
          >
            <span className={star <= shownRating ? "text-accent" : "text-line"}>★</span>
          </button>
        ))}
      </div>

      <label htmlFor="review-comment" className="mb-2 block text-sm font-medium">
        نظر شما (اختیاری)
      </label>
      <textarea
        id="review-comment"
        name="comment"
        rows={3}
        className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
        placeholder="کیفیت، عطر، پخت — تجربه‌تان را بنویسید…"
      />

      <button type="submit" className="mt-3 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
        ثبت نظر
      </button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </form>
  );
}

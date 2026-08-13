import { useEffect, useRef } from "react";
import { LogIn } from "lucide-react";
import { MediaImage } from "../components/MediaImage";

type LoginHighlight = {
  id: number;
  name: string;
  posterPath: string;
  rating: number;
};

const loginHighlights: LoginHighlight[] = [
  {
    id: 1396,
    name: "Breaking Bad",
    posterPath: "/ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg",
    rating: 8.9,
  },
  {
    id: 1399,
    name: "Game of Thrones",
    posterPath: "/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg",
    rating: 8.5,
  },
  {
    id: 1668,
    name: "Friends",
    posterPath: "/2koX1xLkpTQM4IZebYvKysFW1Nh.jpg",
    rating: 8.4,
  },
  {
    id: 1408,
    name: "House",
    posterPath: "/5rIQ3pTjWdZjNUJSJxn1T8MIvoG.jpg",
    rating: 8.6,
  },
  {
    id: 2316,
    name: "The Office",
    posterPath: "/2dApsoX4bd98szjrbj5i3syYOh2.jpg",
    rating: 8.6,
  },
  {
    id: 1398,
    name: "The Sopranos",
    posterPath: "/57okJJUBK0AaijxLh3RjNUaMvFI.jpg",
    rating: 8.6,
  },
  {
    id: 1438,
    name: "The Wire",
    posterPath: "/5asMXKoeT2qA1CWQwjgXLnb2bOm.jpg",
    rating: 8.6,
  },
  {
    id: 66732,
    name: "Stranger Things",
    posterPath: "/uOOtwVbSr4QDjAGIifLDwpb2Pdl.jpg",
    rating: 8.6,
  },
  {
    id: 4607,
    name: "Lost",
    posterPath: "/og6S0aTZU6YUJAbqxeKjCa3kY1E.jpg",
    rating: 8.0,
  },
  {
    id: 60059,
    name: "Better Call Saul",
    posterPath: "/zjg4jpK1Wp2kiRvtt5ND0kznako.jpg",
    rating: 8.7,
  },
  {
    id: 87108,
    name: "Chernobyl",
    posterPath: "/7vcwOySsqeyEdmfHQNT5jHCL2gb.jpg",
    rating: 8.7,
  },
  {
    id: 19885,
    name: "Sherlock",
    posterPath: "/7WTsnHkbA0FaG6R9twfFde0I9hl.jpg",
    rating: 8.5,
  },
  {
    id: 70523,
    name: "Dark",
    posterPath: "/vbG0zu0lIVDZZaUVOZuBIE9kno3.jpg",
    rating: 8.4,
  },
  {
    id: 76479,
    name: "The Boys",
    posterPath: "/mY7SeH4HFFxW1hiI6cWuwCRKptN.jpg",
    rating: 8.4,
  },
  {
    id: 76331,
    name: "Succession",
    posterPath: "/z0XiwdrCQ9yVIr4O0pxzaAYRxdW.jpg",
    rating: 8.3,
  },
  {
    id: 1418,
    name: "The Big Bang Theory",
    posterPath: "/ooBGRQBdbGzBxAVfExiO8r7kloA.jpg",
    rating: 7.9,
  },
  {
    id: 37680,
    name: "Suits",
    posterPath: "/vQiryp6LioFxQThywxbC6TuoDjy.jpg",
    rating: 8.2,
  },
  {
    id: 100088,
    name: "The Last of Us",
    posterPath: "/4pMd9VAdqm96KA2W4X8yetgc7EF.jpg",
    rating: 8.5,
  },
  {
    id: 136315,
    name: "The Bear",
    posterPath: "/pjQUpBEsg89EbL4QWcjfH0s7Txz.jpg",
    rating: 8.2,
  },
  {
    id: 94605,
    name: "Arcane",
    posterPath: "/abf8tHznhSvl9BAElD2cQeRr7do.jpg",
    rating: 8.8,
  },
];

type LoginPageProps = {
  authError?: string | null;
  isAuthLoading: boolean;
  isConfigured: boolean;
  isLoadingUserData?: boolean;
  onSignIn: () => void;
};

export const LoginPage = ({
  authError,
  isAuthLoading,
  isConfigured,
  isLoadingUserData = false,
  onSignIn,
}: LoginPageProps) => {
  const carouselRef = useRef<HTMLElement | null>(null);
  const carouselItems = [...loginHighlights, ...loginHighlights];

  useEffect(() => {
    let animationFrame = 0;

    const updatePosterFocus = () => {
      const carousel = carouselRef.current;
      if (carousel) {
        const carouselRect = carousel.getBoundingClientRect();
        const carouselCenter = carouselRect.left + carouselRect.width / 2;
        const maxDistance = carouselRect.width / 2;

        carousel
          .querySelectorAll<HTMLElement>(".login-poster-frame")
          .forEach((poster) => {
            const posterRect = poster.getBoundingClientRect();
            const posterCenter = posterRect.left + posterRect.width / 2;
            const distance = Math.min(
              1,
              Math.abs(posterCenter - carouselCenter) / maxDistance,
            );
            const focus = Math.max(0, 1 - distance * 1.45);
            const scale = 0.88 + focus * 0.24;
            const opacity = 0.58 + focus * 0.42;
            const saturation = 0.78 + focus * 0.22;
            const lift = Math.round(focus * -10);
            poster.style.setProperty("--poster-focus", focus.toFixed(3));
            poster.style.setProperty("--poster-scale", scale.toFixed(3));
            poster.style.setProperty("--poster-opacity", opacity.toFixed(3));
            poster.style.setProperty("--poster-saturate", saturation.toFixed(3));
            poster.style.setProperty("--poster-lift", `${lift}px`);
          });
      }

      animationFrame = window.requestAnimationFrame(updatePosterFocus);
    };

    animationFrame = window.requestAnimationFrame(updatePosterFocus);

    return () => window.cancelAnimationFrame(animationFrame);
  }, []);

  return (
    <main className="login-screen">
      <section className="login-brand-panel" aria-labelledby="login-title">
        <img
          src="/icon.svg"
          alt=""
          className="login-logo"
          width="160"
          height="70"
        />
        <div className="brand-mark login-brand-mark" aria-label="Series Vault">
          <span className="series">Series</span>
          <strong className="vault">Vault</strong>
        </div>
        <h1 id="login-title">Entre para acessar sua biblioteca</h1>
        <p>
          Acesso restrito a contas Google autorizadas para testar o Series Vault.
        </p>
      </section>

      <section
        ref={carouselRef}
        className="login-poster-carousel"
        aria-label="Séries bem avaliadas"
      >
        <div className="login-poster-track">
          {carouselItems.map((series, index) => (
            <span
              key={`${series.id}-${index}`}
              className="login-poster-frame"
            >
              <MediaImage
                path={series.posterPath}
                alt={`Capa de ${series.name}`}
                className="login-poster"
                fallback="Sem capa"
                size="w342"
              />
              <small>{series.rating.toFixed(1)}</small>
            </span>
          ))}
        </div>
      </section>

      <section className="login-action-panel">
        {authError && <p className="login-error">{authError}</p>}
        {!isConfigured && (
          <p className="login-error">Firebase não configurado neste ambiente.</p>
        )}
        {isLoadingUserData ? (
          <div
            className="login-loading-progress"
            role="progressbar"
            aria-label="Carregando sua biblioteca"
            aria-busy="true"
          >
            <span className="login-loading-bar" />
            <p>Carregando sua biblioteca…</p>
          </div>
        ) : (
          <button
            type="button"
            className="login-google-button"
            disabled={!isConfigured || isAuthLoading}
            onClick={onSignIn}
          >
            <LogIn aria-hidden="true" />
            Entrar com Google
          </button>
        )}
      </section>
    </main>
  );
};

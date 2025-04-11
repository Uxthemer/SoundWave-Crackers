import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-montserrat font-bold text-primary mb-4">
          404
        </h1>
        <h2 className="text-2xl font-montserrat font-bold text-text mb-4">
          Page Not Found
        </h2>
        <p className="text-text/60 mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to="/"
          className="btn-primary inline-block"
          aria-label="Return to home page"
        >
          Return to Home
        </Link>
      </div>
    </div>
  );
} 
import { Link } from "react-router-dom";
import { Home, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-6">
        <SearchX className="w-8 h-8 text-muted-foreground" />
      </div>
      <h1 className="text-4xl font-bold tracking-tight mb-2">404</h1>
      <p className="text-lg text-muted-foreground mb-6">Página não encontrada</p>
      <p className="text-sm text-muted-foreground mb-8 max-w-sm">
        A página que você está procurando não existe ou foi movida.
      </p>
      <Link to="/">
        <Button className="gap-2">
          <Home className="w-4 h-4" />
          Voltar ao Dashboard
        </Button>
      </Link>
    </div>
  );
};

export default NotFound;

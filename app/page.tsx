import ClientWrapper from "./client-wrapper";
import HomeClientComponent from "./home-client-component";

// Server component
export default function Home() {
    return (
        <ClientWrapper>
            <HomeClientComponent />
        </ClientWrapper>
    );
}

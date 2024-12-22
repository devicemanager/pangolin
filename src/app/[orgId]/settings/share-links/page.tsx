import { internal } from "@app/api";
import { authCookieHeader } from "@app/api/cookies";
import { AxiosResponse } from "axios";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { redirect } from "next/navigation";
import { cache } from "react";
import { GetOrgResponse } from "@server/routers/org";
import OrgProvider from "@app/providers/OrgProvider";
import { ListAccessTokensResponse } from "@server/routers/accessToken";
import ShareLinksTable, { ShareLinkRow } from "./components/ShareLinksTable";

type ShareLinksPageProps = {
    params: Promise<{ orgId: string }>;
};

export default async function ShareLinksPage(props: ShareLinksPageProps) {
    const params = await props.params;

    let tokens: ListAccessTokensResponse["accessTokens"] = [];

    try {
        const res = await internal.get<AxiosResponse<ListAccessTokensResponse>>(
            `/org/${params.orgId}/access-tokens`,
            await authCookieHeader()
        );
        tokens = res.data.data.accessTokens;
    } catch (e) {
        console.error("Error fetching tokens", e);
    }

    let org = null;
    try {
        const getOrg = cache(async () =>
            internal.get<AxiosResponse<GetOrgResponse>>(
                `/org/${params.orgId}`,
                await authCookieHeader()
            )
        );
        const res = await getOrg();
        org = res.data.data;
    } catch {
        redirect(`/${params.orgId}/settings/resources`);
    }

    if (!org) {
        redirect(`/${params.orgId}/settings/resources`);
    }

    const rows: ShareLinkRow[] = tokens.map(
        (token) => ({ ...token }) as ShareLinkRow
    );

    return (
        <>
            <SettingsSectionTitle
                title="Manage Share Links"
                description="Create shareable links to grant temporary or permanent access to your resources"
            />

            <OrgProvider org={org}>
                <ShareLinksTable shareLinks={rows} orgId={params.orgId} />
            </OrgProvider>
        </>
    );
}

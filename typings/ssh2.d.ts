/**
 * Created by nessphoro on 6/11/15.
 */

declare module "ssh2"
{
    module ssh2
    {
        export class Client
        {
            connect();
        }
    }

    export = ssh2;
}
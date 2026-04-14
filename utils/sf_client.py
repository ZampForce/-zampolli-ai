import os
import requests
import xml.etree.ElementTree as ET


def get_soap_url():
    """Get SOAP URL based on domain config."""
    domain = os.environ.get("SALESFORCE_DOMAIN", "login")
    return f"https://{domain}.salesforce.com/services/Soap/u/59.0"


class SalesforceREST:
    def __init__(self, session_id, instance_url):
        self.session_id = session_id
        self.instance_url = instance_url
        self.headers = {
            "Authorization": f"Bearer {session_id}",
            "Content-Type": "application/json",
        }
        self.api_base = f"{instance_url}/services/data/v59.0"
        self.Contact = type(self)._ContactProxy(self)

    class _ContactProxy:
        def __init__(self, outer):
            self._outer = outer

        def get(self, record_id):
            return self._outer._get_object("Contact", record_id)

    def query(self, soql):
        r = requests.get(
            f"{self.api_base}/query",
            params={"q": soql},
            headers=self.headers,
            timeout=30,
        )
        r.raise_for_status()
        return r.json()

    def describe(self, sobject):
        r = requests.get(
            f"{self.api_base}/sobjects/{sobject}/describe",
            headers=self.headers,
            timeout=30,
        )
        r.raise_for_status()
        return r.json()

    def _get_object(self, sobject, record_id):
        r = requests.get(
            f"{self.api_base}/sobjects/{sobject}/{record_id}",
            headers=self.headers,
            timeout=30,
        )
        r.raise_for_status()
        return r.json()


def get_sf_client():
    username = os.environ.get("SALESFORCE_USERNAME")
    password = os.environ.get("SALESFORCE_PASSWORD")
    token = os.environ.get("SALESFORCE_TOKEN", "")
    password_combined = password + token
    soap_url = get_soap_url()

    soap_body = f"""<?xml version="1.0" encoding="utf-8" ?>
    <env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <env:Header>
            <CallOptions xmlns="urn:partner.soap.sforce.com">
                <client>sf_agent</client>
            </CallOptions>
        </env:Header>
        <env:Body>
            <login xmlns="urn:partner.soap.sforce.com">
                <username>{username}</username>
                <password>{password_combined}</password>
            </login>
        </env:Body>
    </env:Envelope>"""

    r = requests.post(soap_url, data=soap_body, headers={
        "Content-Type": "text/xml",
        "SOAPAction": "login",
    }, timeout=30)
    r.raise_for_status()

    ns = {"sf": "urn:partner.soap.sforce.com"}
    tree = ET.fromstring(r.content)

    session_id = tree.find(".//sf:sessionId", ns).text
    server_url = tree.find(".//sf:serverUrl", ns).text
    instance_url = server_url.split("/services")[0]

    return SalesforceREST(session_id, instance_url)

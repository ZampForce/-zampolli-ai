from setuptools import setup, find_packages

setup(
    name="salesforce-ai-agent",
    version="0.1.0",
    description="AI Agent for Salesforce - Lead Scoring, Meeting Prep, and Flow Builder",
    author="Salesforce AI Agent",
    python_requires=">=3.9",
    packages=find_packages(),
    install_requires=[
        "python-dotenv>=1.0",
        "requests>=2.31",
        "streamlit>=1.30.0",
    ],
    entry_points={
        "console_scripts": [
            "sf-agent=cli:main",
        ],
    },
)
